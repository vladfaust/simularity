<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { d } from "@/lib/drizzle";
import { Mode } from "@/lib/simulation";
import { ensureScenario } from "@/lib/simulation/scenario";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { asyncComputed } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { BananaIcon, MessagesSquareIcon, MonitorIcon } from "lucide-vue-next";
import { onMounted, ref } from "vue";

const { simulationId } = defineProps<{
  simulationId: number;
}>();

const simulation = ref<
  | Pick<
      typeof d.simulations.$inferSelect,
      "id" | "updatedAt" | "scenarioId" | "mode" | "starterEpisodeId"
    >
  | null
  | undefined
>();

const scenario = asyncComputed(() =>
  simulation.value ? ensureScenario(simulation.value.scenarioId) : undefined,
);

const screenshotUrl = asyncComputed(async () => {
  if (simulation.value?.mode === Mode.Immersive) {
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

const starterEpisodeImageUrl = asyncComputed(() => {
  if (!simulation.value?.starterEpisodeId || !scenario.value) return undefined;

  const episode =
    scenario.value?.content.episodes[simulation.value.starterEpisodeId];
  if (!episode.imagePath) return undefined;

  return scenario.value.resourceUrl(episode.imagePath);
});

onMounted(() => {
  d.db.query.simulations
    .findFirst({
      where: eq(d.simulations.id, simulationId),
      columns: {
        id: true,
        updatedAt: true,
        scenarioId: true,
        mode: true,
        starterEpisodeId: true,
      },
    })
    .then((s) => {
      simulation.value = s ?? null;
    });
});
</script>

<template lang="pug">
.group.flex.flex-col
  img.aspect-video.object-cover.transition(
    v-if="screenshotUrl || starterEpisodeImageUrl"
    :src="screenshotUrl || starterEpisodeImageUrl"
    class="group-hover:brightness-105"
  )
  .grid.aspect-video.h-full.w-full.place-items-center.border-b(
    v-else-if="simulation?.mode === Mode.Chat"
  )
    MessagesSquareIcon(:size="24")
  .aspect-video.w-full.border-b(v-else)

  .flex.flex-col.p-2(v-if="simulation?.updatedAt")
    CustomTitle(:title="scenario?.content.name")
      template(#extra)
        .flex.gap-1
          BananaIcon.cursor-help(
            v-if="scenario?.content.nsfw"
            :size="16"
            v-tooltip="'This scenario is NSFW'"
          )
          MonitorIcon.cursor-help(
            v-if="simulation?.mode === Mode.Immersive"
            :size="16"
            v-tooltip="'This simulation runs in visual novel mode'"
          )
          MessagesSquareIcon.cursor-help(
            v-else
            :size="16"
            v-tooltip="'This simulation runs in chat mode'"
          )
    span.text-xs {{ simulation.updatedAt.toLocaleString() }}
</template>
