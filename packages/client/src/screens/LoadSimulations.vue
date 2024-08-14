<script setup lang="ts">
import { d } from "@/lib/drizzle";
import { routeLocation } from "@/lib/router";
import { desc } from "drizzle-orm";
import { onMounted, ref } from "vue";
import Simulation from "./LoadSimulations/Simulation.vue";

const simulations = ref<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);

onMounted(async () => {
  // TODO: TanStack query + useScroll for infinite query.
  simulations.value = await d.db.query.simulations.findMany({
    columns: { id: true },
    orderBy: desc(d.simulations.updatedAt),
    limit: 9,
  });
});
</script>

<template lang="pug">
.flex.flex-col.gap-3.p-4
  h1 Load game
  .grid.grid-cols-3.gap-3
    RouterLink.transition-transform.pressable(
      v-for="simulation of simulations"
      :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
    )
      Simulation.overflow-hidden.rounded-lg(:simulation-id="simulation.id")
</template>
