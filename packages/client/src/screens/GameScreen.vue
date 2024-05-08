<script setup lang="ts">
import Phaser from "phaser";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { readTextFile, writeTextFile } from "@tauri-apps/api/fs";
import { type Scenario } from "@/lib/types";
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

const { gameId } = defineProps<{ gameId: string }>();

let gameDirPath: string;
let game: Phaser.Game;
let lua: LuaEngine;
let scene: Scene;
let scenario = ref<Scenario | undefined>();
const consoleModal = ref(false);
const busy = ref(false);

const gitHead = ref<string | undefined>();
const currentEpisode = ref<{
  def: Scenario["episodes"][0];
  chunkIndex: number;
} | null>(null);

const sceneText = ref("");

/** Scene code, stored as a human-readable, multiline string. */
const sceneCode = ref("");

const currentEpisodeConsoleObject = computed(() =>
  currentEpisode.value
    ? {
        id: currentEpisode.value.def.id,
        chunks: {
          current: currentEpisode.value.chunkIndex + 1,
          total: currentEpisode.value.def.chunks.length,
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

async function initGame() {
  gameDirPath = await join(await appLocalDataDir(), "simulations", gameId);

  gitHead.value = await gitGetHead(gameDirPath);
  console.log("Game directory", gameDirPath, "HEAD", gitHead.value);

  const manifest: { scenarioId: string } = await readTextFile(
    await join(gameDirPath, "manifest.json"),
  ).then((text) => JSON.parse(text));

  console.log("Loaded manifest.json", manifest);

  scenario.value = await fetch(
    `/scenarios/${manifest.scenarioId}/manifest.json`,
  ).then((response) => response.json());

  if (!scenario.value) {
    throw new Error(`Scenario not found: ${manifest.scenarioId}`);
  }

  console.log("Loaded scenario", scenario.value.name);

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
  });

  game.scene.add(
    "default",
    new Scene(scenario.value, "/scenarios/" + manifest.scenarioId),
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

  const startEpisode = scenario.value!.episodes.find(
    (episode) => episode.id === scenario.value!.startEpisodeId,
  );

  if (!startEpisode) throw new Error("Start episode not found");
  currentEpisode.value = { def: startEpisode, chunkIndex: 0 };

  await luaPromise;
  advance();
}

async function advance() {
  // 1. Advance the scenario.
  //

  if (
    currentEpisode.value &&
    currentEpisode.value.chunkIndex < currentEpisode.value.def.chunks.length
  ) {
    sceneText.value =
      currentEpisode.value.def.chunks[currentEpisode.value.chunkIndex].text;

    sceneCode.value = "";
    for (const line of currentEpisode.value.def.chunks[
      currentEpisode.value.chunkIndex
    ].code) {
      await lua.doString(line);

      if (scene.busy) {
        busy.value = true;
        await scene.busy;
        busy.value = false;
      }
    }

    currentEpisode.value.chunkIndex++;
  } else {
    busy.value = true;

    try {
      const scriptHistory = (
        await readTextFile(await join(gameDirPath, "script.txt"))
      )
        .split("\n")
        .filter(Boolean);

      const writerPrompt = buildWriterPrompt(scenario.value!, scriptHistory);
      console.log("Writer prompt", writerPrompt);

      const writerResponse = await gptPredict(writerPrompt, 128, {
        stopSequences: ["\n"],
      });
      console.log("Writer response", writerResponse);

      const codeHistory = (
        await readTextFile(await join(gameDirPath, "code.lua"))
      )
        .split("\n")
        .filter(Boolean);

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

      currentEpisode.value = null;
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

  const newText = sceneText.value + "\n";
  await writeTextFile(await join(gameDirPath, "script.txt"), newText, {
    append: true,
  });
  console.log("Appended to script.txt", newText);

  const newCode = splitCode(sceneCode.value).join(";") + "\n";
  await writeTextFile(await join(gameDirPath, "code.lua"), newCode, {
    append: true,
  });
  console.log("Appended to code.lua", newCode);

  await gitAdd(gameDirPath, ["script.txt", "code.lua"]);
  gitHead.value = await gitCommit(
    gameDirPath,
    gitHead.value!,
    "Advance scenario",
  );
  console.log("Committed", gitHead.value);
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
