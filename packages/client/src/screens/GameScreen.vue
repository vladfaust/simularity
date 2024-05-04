<script setup lang="ts">
import Phaser from "phaser";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { onMounted, onUnmounted, ref } from "vue";
import { readTextFile } from "@tauri-apps/api/fs";
import { type Scenario } from "@/lib/types";
import { Scene } from "./GameScreen/Scene";
import { LuaEngine, LuaFactory } from "wasmoon";
import Console from "./GameScreen/Console.vue";

const { gameId } = defineProps<{ gameId: string }>();
let game: Phaser.Game;
let scene: Scene;
let scenario: Scenario;
const consoleModal = ref(false);

function consoleEventListener(event: KeyboardEvent) {
  // Detect tilda key press on different keyboard layouts.
  if (["~", "§", "`", ">", "]"].includes(event.key)) {
    consoleModal.value = !consoleModal.value;
    event.preventDefault();
  }
}

onMounted(async () => {
  window.addEventListener("keypress", consoleEventListener);

  const gameDirPath = await join(
    await appLocalDataDir(),
    "simulations",
    gameId,
  );

  const manifest: { scenarioId: string } = await readTextFile(
    await join(gameDirPath, "manifest.json"),
  ).then((text) => JSON.parse(text));

  console.log("Loaded manifest.json", manifest);

  scenario = await fetch(
    `/scenarios/${manifest.scenarioId}/manifest.json`,
  ).then((response) => response.json());

  console.log("Loaded scenario", scenario.name);

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
    new Scene(scenario, "/scenarios/" + manifest.scenarioId),
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
});

let currentEpisode: Scenario["episodes"][0] | null = null;
let currentEpisodeChunkIndex = 0;
let lua: LuaEngine;

const sceneText = ref("");
const sceneCode = ref("");

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

  const startEpisode = scenario.episodes.find(
    (episode) => episode.id === scenario.startEpisodeId,
  );

  if (!startEpisode) throw new Error("Start episode not found");
  currentEpisode = startEpisode;

  await luaPromise;
  advance();
}

const busy = ref(false);

async function advance() {
  if (currentEpisode) {
    sceneText.value = currentEpisode.chunks[currentEpisodeChunkIndex].text;

    sceneCode.value = "";
    for (const line of currentEpisode.chunks[currentEpisodeChunkIndex].code) {
      await lua.doString(line);

      if (scene.busy) {
        busy.value = true;
        await scene.busy;
        busy.value = false;
      }
    }

    if (++currentEpisodeChunkIndex >= currentEpisode.chunks.length) {
      currentEpisode = null;
    }
  } else {
    alert("End of episode");
  }
}

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
    @close="consoleModal = false"
  )
</template>
