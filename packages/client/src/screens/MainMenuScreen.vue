<script setup lang="ts">
import { v4 as uuidv4 } from "uuid";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { createDir, writeTextFile } from "@tauri-apps/api/fs";
import { useRouter } from "vue-router";
import { routeLocation } from "../lib/router";
import { gitAdd, gitCommit, gitInit } from "@/lib/tauri";

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

  // Initialize a Git repository.
  await gitInit(gameDirPath).then(() =>
    console.log("Initialized repository", gameDirPath),
  );

  // Create a manifest.json file.
  await writeTextFile(
    await join(gameDirPath, "manifest.json"),
    JSON.stringify({ scenarioId: import.meta.env.VITE_DEFAULT_SCENARIO_ID }),
  ).then(() => console.log("Created manifest.json"));

  await gitAdd(gameDirPath, ["manifest.json"]).then(() =>
    console.log("Added files"),
  );

  await gitCommit(gameDirPath, null, "Initial commit").then((commitHash) =>
    console.log("Committed", commitHash),
  );

  router.push(routeLocation({ name: "Game", params: { gameId } }));
}
</script>

<template lang="pug">
button(@click="newGame") New game
</template>
