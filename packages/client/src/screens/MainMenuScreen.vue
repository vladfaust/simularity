<script setup lang="ts">
import { v4 as uuidv4 } from "uuid";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { createDir, writeTextFile } from "@tauri-apps/api/fs";
import { useRouter } from "vue-router";
import { routeLocation } from "../lib/router";
import { gitInitRepository } from "@/lib/tauri";

const router = useRouter();

async function newGame() {
  const gameId = uuidv4();

  const gameDirPath = await join(
    await appLocalDataDir(),
    "simulations",
    gameId,
  );

  // Create the game directory.
  await createDir(gameDirPath, { recursive: true });

  // Create a manifest.json file.
  await writeTextFile(
    await join(gameDirPath, "manifest.json"),
    JSON.stringify({ scenarioId: import.meta.env.VITE_DEFAULT_SCENARIO_ID }),
  ).then(() => console.log("Created manifest.json"));

  // Initialize a Git repository.
  await gitInitRepository(gameDirPath, ["manifest.json"]).then(() =>
    console.log("Initialized Git repository at", gameDirPath),
  );

  router.push(routeLocation({ name: "Game", params: { gameId } }));
}
</script>

<template lang="pug">
button(@click="newGame") New game
</template>
