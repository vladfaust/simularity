<script setup lang="ts">
import { onMounted, ref } from "vue";
import { routeLocation } from "@/lib/router";
import { d } from "@/lib/drizzle";
import { desc } from "drizzle-orm";

const simulations = ref<(typeof d.simulations.$inferSelect)[]>([]);

onMounted(async () => {
  simulations.value = await d.db.query.simulations.findMany({
    orderBy: desc(d.simulations.updatedAt),
    limit: 10,
  });
});
</script>

<template lang="pug">
.flex.flex-col.gap-3.p-4
  h1 Load game
  .grid.grid-cols-3.gap-3
    RouterLink.flex.flex-col.overflow-hidden.rounded-lg.transition-transform.pressable(
      v-for="simulation of simulations"
      :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
    )
      img.aspect-video.w-full.bg-blue-400(
        v-if="simulation.screenshot"
        :src="simulation.screenshot"
      )
      .aspect-video.w-full.bg-blue-400(v-else)
      span Updated: {{ new Date(+simulation.updatedAt).toLocaleString() }}
</template>

<style lang="scss" scoped></style>
