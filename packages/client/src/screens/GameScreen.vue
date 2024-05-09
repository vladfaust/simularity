<script setup lang="ts">
import Phaser from "phaser";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { computed, onMounted, onUnmounted, ref, toRaw } from "vue";
import {
  type FsOptions,
  exists,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/api/fs";
import { type Stage, type Scenario } from "@/lib/types";
import { Scene } from "./GameScreen/Scene";
import { LuaEngine, LuaFactory } from "wasmoon";
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
let game: Phaser.Game;
let lua: LuaEngine;
let scene: Scene;
let scenario = ref<Scenario | undefined>();
const consoleModal = ref(false);
const busy = ref(false);

const gitHead = ref<string | undefined>();

const state = ref<State>({ episode: null });
const currentEpisode = computed(() =>
  state.value.episode
    ? scenario.value?.episodes.find((e) => e.id === state.value.episode!.id)
    : null,
);

const sceneText = ref("");

/** Scene code, stored as a human-readable, multiline string. */
const sceneCode = ref("");

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

async function initGame() {
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

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-screen",
    width: 1920,
    height: 1080,

    // Sets game scaling
    scale: {
      // Fit to window
      mode: Phaser.Scale.ENVELOP,
      // // Center vertically and horizontally
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },

    preserveDrawingBuffer: true,
  });

  game.scene.add(
    "default",
    new Scene(scenario.value, "/scenarios/" + gameManifest.scenarioId),
    true,
  );

  // TODO: Call once the scene is ready.
  const interval = setInterval(() => {
    const defaultScene = game.scene.getScene("default") as Scene | null;

    if (defaultScene) {
      scene = defaultScene;
      startGame();
      clearInterval(interval);
    }
  }, 100);
}

// Called once the Phaser scene is ready.
async function startGame() {
  // IDEA: Move this logic to the Scene class, pass the stage as a prop.
  const stage: Stage | undefined = await readGameTextFile(
    GameFilePath.Stage,
  ).then((text) => (text ? JSON.parse(text) : undefined));
  if (stage) {
    console.debug("Will set stage", stage);

    await scene.setScene(stage.scene.locationId, stage.scene.sceneId);

    for (const character of stage.characters) {
      await scene.addCharacter(character.id);
      scene.setOutfit(character.id, character.outfitId);
      scene.setExpression(character.id, character.expressionId);
    }

    await scene.busy;
    console.log("Set stage", stage);
  }

  const factory = new LuaFactory();
  const luaPromise = factory.createEngine().then((_lua) => {
    lua = _lua;

    lua.global.set("set_scene", (locationId: string, sceneId: string) => {
      sceneCode.value += `set_scene("${locationId}", "${sceneId}")\n`;
      scene.setScene(locationId, sceneId);
    });

    lua.global.set("add_character", (characterId: string) => {
      sceneCode.value += `add_character("${characterId}")\n`;
      scene.addCharacter(characterId);
    });

    lua.global.set("set_outfit", (characterId: string, outfitId: string) => {
      sceneCode.value += `set_outfit("${characterId}", "${outfitId}")\n`;
      scene.setOutfit(characterId, outfitId);
    });

    lua.global.set(
      "set_expression",
      (characterId: string, expressionId: string) => {
        sceneCode.value += `set_expression("${characterId}", "${expressionId}")\n`;
        scene.setExpression(characterId, expressionId);
      },
    );
  });

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
    sceneText.value = latestScriptLine!;
    sceneCode.value = splitCode(latestCodeLine || "").join("\n");
  } else if (stage) {
    // There is no episode, but the stage is set already,
    // therefore the game has already begun.
    sceneText.value = latestScriptLine!;
    sceneCode.value = splitCode(latestCodeLine || "").join("\n");
  } else {
    // Start the game from the beginning.
    state.value.episode = {
      id: scenario.value!.startEpisodeId,
      chunkIndex: 0,
    };

    // Advance the scenario once Lua is ready.
    luaPromise.then(() => advance());
  }

  await luaPromise;
}

async function advance() {
  // 1. Advance the scenario.
  //

  if (
    state.value.episode &&
    currentEpisode.value &&
    state.value.episode.chunkIndex < currentEpisode.value.chunks.length
  ) {
    sceneText.value =
      currentEpisode.value.chunks[state.value.episode.chunkIndex].text;

    sceneCode.value = "";
    for (const line of currentEpisode.value.chunks[
      state.value.episode.chunkIndex
    ].code) {
      await lua.doString(line);

      if (scene.busy) {
        busy.value = true;
        await scene.busy;
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

      sceneText.value = writerResponse;
      for (const line of splitCode(directorResponse)) {
        await lua.doString(line);

        if (scene.busy) {
          busy.value = true;
          await scene.busy;
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

  const newText = sceneText.value + "\n";
  filePromises.push(
    writeGameTextFile(GameFilePath.Script, newText, { append: true }).then(() =>
      console.log("Appended", GameFilePath.Script, newText),
    ),
  );

  const newCode = splitCode(sceneCode.value).join(";") + "\n";
  filePromises.push(
    writeGameTextFile(GameFilePath.Code, newCode, { append: true }).then(() =>
      console.log("Appended", GameFilePath.Code, newCode),
    ),
  );

  // Update the stage.
  const newStage = scene.dumpStage();
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

  await updateGame(gameId, gitHead.value!, screenshot());
  console.log("Updated game in DB", gameId);
}

/**
 * Takes a screenshot of the game and returns the data URL.
 */
// TODO: Also screenshot UI elements.
function screenshot(mime = "image/jpeg", quality = 0.8) {
  return game.canvas.toDataURL(mime, quality);
}

onMounted(() => {
  window.addEventListener("keypress", consoleEventListener);
  initGame();
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
    p.grow {{ sceneText }}
    .flex.justify-end
      button.rounded.border.px-3.py-2.pressable(
        @click="advance"
        :disabled="busy"
      ) Next

  Console(
    :open="consoleModal"
    :scene-code="sceneCode"
    :scene-text="sceneText"
    :episode="currentEpisodeConsoleObject"
    @close="consoleModal = false"
  )
</template>
