<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { d } from "@/lib/drizzle";
import { ensureScenario } from "@/lib/simulation/scenario";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { asyncComputed } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { BananaIcon, MonitorIcon, PlayCircleIcon } from "lucide-vue-next";
import { onMounted, ref } from "vue";

const { simulationId } = defineProps<{
  simulationId: number;
}>();

const simulation = ref<
  | Pick<typeof d.simulations.$inferSelect, "id" | "updatedAt" | "scenarioId">
  | null
  | undefined
>();

const scenario = asyncComputed(() =>
  simulation.value ? ensureScenario(simulation.value.scenarioId) : undefined,
);

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
        scenarioId: true,
      },
    })
    .then((s) => {
      simulation.value = s ?? null;
    });
});
</script>

<template lang="pug">
.group.flex.flex-col
  .relative.aspect-video.w-full.overflow-hidden
    .absolute.z-10.flex.h-full.w-full.items-center.justify-center.transition(
      class="group-hover:bg-black/30"
    )
      PlayCircleIcon.text-white.opacity-0.transition(
        :size="32"
        class="group-hover:opacity-100 group-hover:brightness-105"
      )
    img.object-cover.transition(
      v-if="screenshotUrl"
      :src="screenshotUrl"
      class="group-hover:scale-105"
    )
    .aspect-video.w-full.bg-blue-400(v-else)

  .flex.flex-col.p-2(v-if="simulation?.updatedAt")
    CustomTitle(:title="scenario?.name")
      template(#extra)
        .flex.gap-1
          BananaIcon.cursor-help(
            v-if="scenario?.nsfw"
            :size="16"
            v-tooltip="'This scenario is NSFW'"
          )
          MonitorIcon.cursor-help(
            :size="16"
            v-tooltip="'This simulation runs in visual novel mode'"
          )
    span.text-xs {{ simulation.updatedAt.toLocaleString() }}
</template>
