<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router";
import { routeLocation } from "../lib/router";
import { d } from "@/lib/drizzle";
import { type Scenario } from "@/lib/simulation";
import { eq } from "drizzle-orm";
import { BookMarkedIcon, BookOpenIcon, SettingsIcon } from "lucide-vue-next";
import { findEpisode } from "@/lib/simulation/scenario";
import { emptyStateDto } from "@/lib/simulation/state";

const router = useRouter();

// REFACTOR: Move to `@lib/simulation`.
async function newSimulation() {
  const scenarioId = import.meta.env.VITE_DEFAULT_SCENARIO_ID;

  const scenario: Scenario | undefined = await fetch(
    `/scenarios/${scenarioId}/manifest.json`,
  ).then((response) => response.json());
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const startEpisode = findEpisode(scenario, scenario.startEpisodeId);
  if (!startEpisode) {
    throw new Error(`Start episode not found: ${scenario.startEpisodeId}`);
  }

  const chunk = startEpisode.chunks.at(0);
  if (!chunk) {
    throw new Error(`Episode has no chunks: ${scenario.startEpisodeId}`);
  }

  const simulationId = await d.db.transaction(async (tx) => {
    const simulation = (
      await tx
        .insert(d.simulations)
        .values({ scenarioId })
        .returning({ id: d.simulations.id })
    )[0];

    const checkpoint = (
      await tx
        .insert(d.checkpoints)
        .values({
          simulationId: simulation.id,
          summary: startEpisode.checkpoint?.summary,
          state: startEpisode.checkpoint?.state || emptyStateDto(),
        })
        .returning({ id: d.checkpoints.id })
    )[0];

    const writerUpdate = (
      await tx
        .insert(d.writerUpdates)
        .values({
          simulationId: simulation.id,
          checkpointId: checkpoint.id,
          characterId: chunk.characterId,
          text: chunk.text,
          episodeId: scenario.startEpisodeId,
          episodeChunkIndex: 0,
        })
        .returning({
          id: d.writerUpdates.id,
        })
    )[0];

    if (chunk.code) {
      await tx.insert(d.directorUpdates).values({
        writerUpdateId: writerUpdate.id,
        code: chunk.code,
      });
    }

    // Set simulation current update ID.
    await tx
      .update(d.simulations)
      .set({ currentUpdateId: writerUpdate.id })
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
    button.btn.btn-md.transition-transform.pressable(@click="newSimulation")
      BookOpenIcon(:size="20")
      span New game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'LoadSimulations' })"
    )
      BookMarkedIcon(:size="20")
      span Load game
    RouterLink.btn-md.btn.transition-transform.pressable(
      :to="routeLocation({ name: 'Settings' })"
    )
      SettingsIcon(:size="20")
      span Settings
    //- RouterLink.btn-md.btn.transition-transform.pressable(
    //-   :to="routeLocation({ name: 'GnbfTester' })"
    //- ) GNBF tester
</template>

<style lang="scss" scoped>
.btn {
  @apply rounded-lg border;
}
</style>
