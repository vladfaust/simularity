<script setup lang="ts">
import Phaser from "phaser";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { readTextFile, writeTextFile } from "@tauri-apps/api/fs";
import { type Scenario } from "@/lib/types";
import { Scene } from "./GameScreen/Scene";
import { LuaEngine, LuaFactory } from "wasmoon";
import Console from "./GameScreen/Console.vue";
import { gptPredict } from "@/lib/tauri";

const { gameId } = defineProps<{ gameId: string }>();

let gameDirPath: string;
let game: Phaser.Game;
let lua: LuaEngine;
let scene: Scene;
let scenario = ref<Scenario | undefined>();
const consoleModal = ref(false);
const busy = ref(false);
let currentEpisode = ref<Scenario["episodes"][0] | null>(null);
let currentEpisodeChunkIndex = ref(0);
const sceneText = ref("");
const sceneCode = ref("");
const currentEpisodeConsoleObject = computed(() =>
  currentEpisode.value
    ? {
        id: currentEpisode.value.id,
        chunks: {
          current: currentEpisodeChunkIndex.value,
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

async function initGame() {
  gameDirPath = await join(await appLocalDataDir(), "simulations", gameId);

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
  currentEpisode.value = startEpisode;

  await luaPromise;
  advance();
}

function buildPrompt(history: string[]) {
  if (!scenario.value) {
    throw new Error("Scenario not loaded");
  }

  const locations = scenario.value.locations.map((location) => {
    const scenes = location.scenes.map((scene) =>
      `
##### ${scene.id}
${scene.prompt}
`.trim(),
    );

    return `
### ${location.id}
[Name]: ${location.name}
${location.prompt}
#### Scenes
${scenes.join("\n")}
`.trim();
  });

  const characters = scenario.value.characters.map((character) => {
    const outfits = character.outfits.map((outfit) =>
      `
##### ${outfit.id}
${outfit.prompt}
`.trim(),
    );

    return `
### ${character.id}
[Name]: ${character.displayName}
[Personality]: ${character.personalityPrompt}
[Appearance]: ${character.appearancePrompt}
${character.scenarioPrompt}
#### Outfits
${outfits.join("\n")}
  `.trim();
  });

  return (
    `
# ${scenario.value.name}
${scenario.value.globalPrompt}
## Locations
${locations.join("\n")}
## Characters
${characters.join("\n")}
## Script
${history.join("\n")}
`.trim() + "\n"
  );
}

async function advance() {
  // 1. Append the current scene to the script and code files.
  //

  await writeTextFile(
    await join(gameDirPath, "script.txt"),
    sceneText.value + "\n",
    { append: true },
  );

  await writeTextFile(
    await join(gameDirPath, "code.txt"),
    sceneCode.value + "\f",
    { append: true },
  );

  // TODO: Commit to Git.

  // 2. Advance the scene.
  //

  if (
    currentEpisode.value &&
    currentEpisodeChunkIndex.value < currentEpisode.value.chunks.length
  ) {
    sceneText.value =
      currentEpisode.value.chunks[currentEpisodeChunkIndex.value].text;

    sceneCode.value = "";
    for (const line of currentEpisode.value.chunks[
      currentEpisodeChunkIndex.value
    ].code) {
      await lua.doString(line);

      if (scene.busy) {
        busy.value = true;
        await scene.busy;
        busy.value = false;
      }

      sceneCode.value += line + "\n";
    }

    if (
      ++currentEpisodeChunkIndex.value >= currentEpisode.value.chunks.length
    ) {
      // NOTE: We're not setting currentEpisode to null here,
      // because we want to keep the last episode for debugging purposes.
      console.log("Episode finished");
    }
  } else {
    busy.value = true;

    try {
      const script = await readTextFile(await join(gameDirPath, "script.txt"));
      const prompt = buildPrompt(script.split("\n").filter(Boolean));
      currentEpisode.value = null;
      console.log("Prompt", prompt);
      const response = await gptPredict(prompt, 128, { stopSequences: ["\n"] });
      sceneText.value = response;
      sceneCode.value = "";
    } finally {
      busy.value = false;
    }
  }
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
