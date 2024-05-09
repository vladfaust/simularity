<script setup lang="ts">
import { v4 as uuidv4 } from "uuid";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { createDir, writeTextFile } from "@tauri-apps/api/fs";
import { RouterLink, useRouter } from "vue-router";
import { routeLocation } from "../lib/router";
import { gitAdd, gitCommit, gitInit } from "@/lib/tauri";
import { createGame } from "@/lib/db";

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

  const head = await gitCommit(gameDirPath, null, "Initial commit");
  console.log("Committed", head);

  await createGame(gameId, head);
  console.log("Created game", gameId);

  router.push(routeLocation({ name: "Game", params: { gameId } }));
}
</script>

<template lang="pug">
.grid.h-screen.place-items-center
  .flex.flex-col.gap-2
    button.btn.btn-md.transition-transform.pressable(@click="newGame") New game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'LoadGame' })"
    ) Load game
</template>
