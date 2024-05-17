<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router";
import { routeLocation } from "../lib/router";
import { d } from "@/lib/drizzle";
import { type Scenario } from "@/lib/types";
import { DEFAULT_SCENARIO_ID } from "@/env";
import { eq } from "drizzle-orm";

const router = useRouter();

async function newSimulation() {
  const scenarioId = DEFAULT_SCENARIO_ID;

  const scenario: Scenario | undefined = await fetch(
    `/scenarios/${scenarioId}/manifest.json`,
  ).then((response) => response.json());
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const startEpisode = scenario.episodes.at(0);
  if (!startEpisode) {
    throw new Error(`Scenario has no episodes: ${scenarioId}`);
  }

  const chunk = startEpisode.chunks.at(0);
  if (!chunk) {
    throw new Error(`Episode has no chunks: ${startEpisode.id}`);
  }

  const simulationId = await d.db.transaction(async (tx) => {
    const simulation = (
      await tx
        .insert(d.simulations)
        .values({ scenarioId })
        .returning({ id: d.simulations.id })
    )[0];

    const writerUpdate = (
      await tx
        .insert(d.writerUpdates)
        .values({
          simulationId: simulation.id,
          content: chunk.writerUpdateText,
          episodeId: startEpisode.id,
          episodeChunkIndex: 0,
        })
        .returning({
          id: d.writerUpdates.id,
        })
    )[0];

    await tx.insert(d.directorUpdates).values({
      writerUpdateId: writerUpdate.id,
      content: chunk.directorUpdateCode,
    });

    // Set simulation head.
    await tx
      .update(d.simulations)
      .set({ headWriterUpdateId: writerUpdate.id })
      .where(eq(d.simulations.id, simulation.id));

    return simulation.id;
  });

  console.log("Created simulation", simulationId);

  router.push(
    routeLocation({
      name: "Simulation",
      params: { simulationId },
    }),
  );
}
</script>

<template lang="pug">
.grid.h-screen.place-items-center
  .flex.flex-col.gap-2
    button.btn.btn-md.transition-transform.pressable(@click="newSimulation") New game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'LoadSimulations' })"
    ) Load game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'GnbfTester' })"
    ) GNBF tester
</template>
