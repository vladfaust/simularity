<script setup lang="ts">
import { d } from "@/lib/drizzle";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { asyncComputed } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { onMounted, ref } from "vue";

const { simulationId } = defineProps<{
  simulationId: string;
}>();

const simulation = ref<
  Pick<typeof d.simulations.$inferSelect, "id" | "updatedAt"> | null | undefined
>();

const screenshotUrl = asyncComputed(async () => {
  if (simulation.value) {
    return convertFileSrc(
      await join(
        await appLocalDataDir(),
        "screenshots",
        simulation.value.id + ".jpg",
      ),
    );
  } else {
    return null;
  }
});

onMounted(() => {
  d.db.query.simulations
    .findFirst({
      where: eq(d.simulations.id, simulationId),
      columns: {
        id: true,
        updatedAt: true,
      },
    })
    .then((s) => {
      simulation.value = s ?? null;
    });
});
</script>

<template lang="pug">
.flex.flex-col.border
  img.aspect-video.w-full(v-if="screenshotUrl" :src="screenshotUrl")
  .aspect-video.w-full.bg-blue-400(v-else)
  .flex.p-2(v-if="simulation")
    span {{ new Date(+simulation.updatedAt).toLocaleString() }}
</template>
