<script setup lang="ts">
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { computed, onMounted, onUnmounted, ref, toRaw } from "vue";
import {
  type FsOptions,
  exists,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/api/fs";
import { type Stage, type Scenario } from "@/lib/types";
import { DefaultScene } from "./GameScreen/Scene";
import Console from "./GameScreen/Console.vue";
import {
  gitAdd,
  gitCommit,
  gitHead as gitGetHead,
  gptPredict,
} from "@/lib/tauri";
import { splitCode, zip } from "@/lib/utils";
import { buildWriterPrompt } from "@/lib/ai/writer";
import { buildDirectorPrompt, buildGnbf } from "@/lib/ai/director";
import { updateGame } from "@/lib/db";
import * as ini from "ini";
import { Game } from "./GameScreen/Game";

/**
 * Game state, serialized to `state.ini`.
 */
type State = {
  episode: {
    id: string;
    chunkIndex: number;
  } | null;
};

const FILE_SCENARIO_MANIFEST = "manifest.json";

enum GameFilePath {
  Manifest = "manifest.json",
  State = "state.ini",
  Script = "script.txt",
  Code = "code.lua",
  Stage = "stage.json",
}

const { gameId } = defineProps<{ gameId: string }>();

let gameDirPath: string;
let gameInstance: Game;
let sceneInstance: DefaultScene;

let scenario = ref<Scenario | undefined>();
const gitHead = ref<string | undefined>();

const busy = ref(false);

const state = ref<State>({ episode: null });
const currentEpisode = computed(() =>
  state.value.episode
    ? scenario.value?.episodes.find((e) => e.id === state.value.episode!.id)
    : null,
);

const writerScript = ref("");

/** Scene code, stored as a human-readable, multiline string. */
const directorCode = ref("");

const consoleModal = ref(false);
const currentEpisodeConsoleObject = computed(() =>
  state.value.episode && currentEpisode.value
    ? {
        id: currentEpisode.value.id,
        chunks: {
          current: state.value.episode.chunkIndex + 1,
          total: currentEpisode.value.chunks.length,
        },
      }
    : null,
);

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  if (["~", "§", "`", ">", "]"].includes(event.key)) {
    consoleModal.value = !consoleModal.value;
    event.preventDefault();
  }
}

async function readGameTextFile(fileName: string): Promise<string | undefined> {
  if (!(await exists(await join(gameDirPath, fileName)))) {
    return undefined;
  }

  return readTextFile(await join(gameDirPath, fileName));
}

async function writeGameTextFile(
  fileName: string,
  text: string,
  options?: FsOptions,
): Promise<void> {
  return writeTextFile(await join(gameDirPath, fileName), text, options);
}

async function startGame() {
  // OPTIMIZE: This chunk of code is suboptimal.
  //

  const latestScriptLine = await readGameTextFile(GameFilePath.Script).then(
    (text) => text?.split("\n").filter(Boolean).pop(),
  );

  const latestCodeLine = await readGameTextFile(GameFilePath.Code).then(
    (text) => text?.split("\n").filter(Boolean).pop(),
  );

  if (state.value.episode) {
    // There is an episode in progress.
    writerScript.value = latestScriptLine!;
    directorCode.value = splitCode(latestCodeLine || "").join("\n");
  } else if (latestScriptLine) {
    // There is no episode, but the stage is set already,
    // therefore the game has already begun.
    writerScript.value = latestScriptLine!;
    directorCode.value = splitCode(latestCodeLine || "").join("\n");
  } else {
    // Start the game from the beginning.
    state.value.episode = {
      id: scenario.value!.startEpisodeId,
      chunkIndex: 0,
    };

    advance();
  }
}

async function advance() {
  // 1. Advance the scenario.
  //

  if (
    state.value.episode &&
    currentEpisode.value &&
    state.value.episode.chunkIndex < currentEpisode.value.chunks.length
  ) {
    writerScript.value =
      currentEpisode.value.chunks[state.value.episode.chunkIndex].text;

    directorCode.value = "";
    for (const line of currentEpisode.value.chunks[
      state.value.episode.chunkIndex
    ].code) {
      await sceneInstance.eval(line);
      directorCode.value += line + "\n";

      if (sceneInstance.busy) {
        busy.value = true;
        await sceneInstance.busy;
        busy.value = false;
      }
    }

    state.value.episode.chunkIndex++;
  } else {
    busy.value = true;
    state.value.episode = null;

    try {
      const scriptHistory = (await readGameTextFile(GameFilePath.Script))
        ?.split("\n")
        .filter(Boolean);
      if (!scriptHistory) {
        throw new Error("Script history not found");
      }

      const writerPrompt = buildWriterPrompt(scenario.value!, scriptHistory);
      console.log("Writer prompt", writerPrompt);

      const writerResponse = await gptPredict(writerPrompt, 128, {
        stopSequences: ["\n"],
      });
      console.log("Writer response", writerResponse);

      const codeHistory = (await readGameTextFile(GameFilePath.Code))
        ?.split("\n")
        .filter(Boolean);
      if (!codeHistory) {
        throw new Error("Code history not found");
      }

      const directorPrompt = buildDirectorPrompt(
        scenario.value!,
        zip(scriptHistory, codeHistory).map(([text, code]) => ({
          code,
          text,
        })),
        writerResponse,
      );
      console.log("Director prompt", directorPrompt);
      const grammar = buildGnbf(scenario.value!);
      console.log("Director grammar", grammar);
      const directorResponse = await gptPredict(directorPrompt, 128, {
        stopSequences: ["\n"],
        grammar,
        temp: 0,
      });
      console.log("Director response", directorResponse);
      busy.value = false;

      writerScript.value = writerResponse;
      directorCode.value = "";
      for (const line of splitCode(directorResponse)) {
        await sceneInstance.eval(line);
        directorCode.value += line + "\n";

        if (sceneInstance.busy) {
          busy.value = true;
          await sceneInstance.busy;
          busy.value = false;
        }
      }
    } finally {
      busy.value = false;
    }
  }

  // 2. Commit the updates.
  //

  const filePromises = [];

  const newText = writerScript.value + "\n";
  filePromises.push(
    writeGameTextFile(GameFilePath.Script, newText, { append: true }).then(() =>
      console.log("Appended", GameFilePath.Script, newText),
    ),
  );

  const newCode = splitCode(directorCode.value).join(";") + ";\n";
  filePromises.push(
    writeGameTextFile(GameFilePath.Code, newCode, { append: true }).then(() =>
      console.log("Appended", GameFilePath.Code, newCode),
    ),
  );

  // Update the stage.
  const newStage = sceneInstance.dumpStage();
  filePromises.push(
    writeGameTextFile(GameFilePath.Stage, JSON.stringify(newStage), {
      append: false,
    }).then(() => console.log("Replaced", GameFilePath.Stage, newStage)),
  );

  // Update the state.
  filePromises.push(
    writeGameTextFile(GameFilePath.State, ini.stringify(state.value), {
      append: false,
    }).then(() =>
      console.log("Replaced", GameFilePath.State, toRaw(state.value)),
    ),
  );

  await Promise.all(filePromises);

  await gitAdd(gameDirPath, [
    GameFilePath.Script,
    GameFilePath.Code,
    GameFilePath.Stage,
  ]);
  gitHead.value = await gitCommit(
    gameDirPath,
    gitHead.value!,
    "Advance scenario",
  );
  console.log("Committed", gitHead.value);

  await updateGame(gameId, gitHead.value!, gameInstance.screenshot());
  console.log("Updated game in DB", gameId);
}

onMounted(async () => {
  // Register a console event listener.
  window.addEventListener("keypress", consoleEventListener);

  gameDirPath = await join(await appLocalDataDir(), "simulations", gameId);

  gitHead.value = (await gitGetHead(gameDirPath)).hash;
  console.log("Game directory", gameDirPath, "HEAD", gitHead.value);

  const gameManifest: { scenarioId: string } = await readGameTextFile(
    GameFilePath.Manifest,
  ).then((text) => {
    if (text) return JSON.parse(text);
    else throw new Error("Game manifest not found");
  });
  console.log("Read", GameFilePath.Manifest, gameManifest);

  scenario.value = await fetch(
    `/scenarios/${gameManifest.scenarioId}/${FILE_SCENARIO_MANIFEST}`,
  ).then((response) => response.json());
  if (!scenario.value) {
    throw new Error(`Scenario not found: ${gameManifest.scenarioId}`);
  } else {
    console.log("Read scenario", scenario.value.name);
  }

  // Read state.
  //

  const stateText = await readGameTextFile(GameFilePath.State);
  if (stateText) {
    state.value = ini.parse(stateText) as State;
    console.log("Read", GameFilePath.State, state.value);
  } else {
    console.log("Empty", GameFilePath.State);
  }

  const initialStage: Stage | undefined = await readGameTextFile(
    GameFilePath.Stage,
  ).then((text) => (text ? JSON.parse(text) : undefined));

  gameInstance = new Game();

  sceneInstance = await gameInstance.createDefaultScene(
    { id: gameManifest.scenarioId, object: scenario.value },
    initialStage,
  );

  startGame();
});

onUnmounted(() => {
  window.removeEventListener("keypress", consoleEventListener);
});
</script>

<template lang="pug">
.relative.h-screen.w-screen.bg-red-400
  #game-screen
  .absolute.top-0.w-full.bg-white.bg-opacity-50.p-1 {{ scenario?.name }}: {{ gameId }}
  .absolute.bottom-0.flex.h-32.w-full.flex-col.bg-yellow-500.bg-opacity-90.p-3
    p.grow {{ writerScript }}
    .flex.justify-end
      button.rounded.border.px-3.py-2.pressable(
        @click="advance"
        :disabled="busy"
      ) Next

  Console(
    :open="consoleModal"
    :scene-code="directorCode"
    :scene-text="writerScript"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
