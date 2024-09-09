<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import Placeholder from "@/components/Placeholder.vue";
import { d } from "@/lib/drizzle";
import { Mode } from "@/lib/simulation";
import { ensureScenario } from "@/lib/simulation/scenario";
import { nonNullable } from "@/lib/utils";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { asyncComputed } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { CherryIcon, MessagesSquareIcon, MonitorIcon } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import Message, { type SimpleMessage } from "./Save/Message.vue";

const { simulationId } = defineProps<{
  simulationId: number;
}>();

const simulation = ref<typeof d.simulations.$inferSelect | null | undefined>();

const scenario = asyncComputed(() =>
  simulation.value ? ensureScenario(simulation.value.scenarioId) : undefined,
);

const scenarioThumbnailUrl = asyncComputed(
  () => scenario.value?.getThumbnailUrl() ?? null,
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

const latestUpdate = asyncComputed(() => {
  if (!simulation.value?.currentUpdateId) return null;

  return d.db.query.writerUpdates.findFirst({
    where: eq(d.writerUpdates.id, simulation.value.currentUpdateId),
  });
});

const latestMessage = computed<SimpleMessage | null>(() => {
  return latestUpdate.value
    ? {
        id: latestUpdate.value.id,
        characterId: latestUpdate.value.characterId,
        text: latestUpdate.value.text,
        clockMinutes: latestUpdate.value.simulationDayClock,
        createdAt: latestUpdate.value.createdAt!,
      }
    : null;
});

onMounted(() => {
  d.db.query.simulations
    .findFirst({
      where: eq(d.simulations.id, simulationId),
    })
    .then((s) => {
      simulation.value = s ?? null;
    });
});
</script>

<template lang="pug">
.group.flex.flex-col
  .relative.aspect-video.w-full.overflow-hidden
    img.h-full.w-full.object-cover.transition(
      v-if="screenshotUrl || starterEpisodeImageUrl || scenarioThumbnailUrl"
      :src="nonNullable(screenshotUrl || starterEpisodeImageUrl || scenarioThumbnailUrl)"
    )
    Placeholder.h-full.w-full.border-b(v-else)
    ul.absolute.bottom-0.left-0.z-10.flex.h-full.w-full.flex-col-reverse.gap-1.overflow-y-scroll.p-2(
      v-if="scenario && latestMessage"
    )
      Message(:key="latestMessage.id" :scenario :message="latestMessage")

  .flex.flex-col.p-3(v-if="simulation?.updatedAt")
    CustomTitle(:title="scenario?.content.name")
      template(#extra)
        .flex.gap-1
          CherryIcon.cursor-help(
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

    span.text-xs.leading-tight.text-gray-500 {{ simulation.updatedAt.toLocaleString() }}
</template>
