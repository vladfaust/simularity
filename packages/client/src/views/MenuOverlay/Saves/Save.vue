<script setup lang="ts">
import ChatModeIcon from "@/components/Icons/ChatModeIcon.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import SandboxModeIcon from "@/components/Icons/SandboxModeIcon.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
import { d } from "@/lib/drizzle";
import { Mode } from "@/lib/simulation";
import { nonNullable } from "@/lib/utils";
import { useLocalScenarioQuery, useSimulationQuery } from "@/queries";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { asyncComputed } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Message, { type SimpleMessage } from "./Save/Message.vue";

const { simulationId } = defineProps<{
  simulationId: number;
}>();

const { data: simulation } = useSimulationQuery(simulationId);

const { data: scenario } = useLocalScenarioQuery(
  computed(() => simulation.value?.scenarioId),
);

const scenarioCoverUrl = asyncComputed(
  () => scenario.value?.getCoverImageUrl() ?? null,
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

const { t } = useI18n({
  messages: {
    "en-US": {
      saves: {
        save: {
          updatedAt: "Upd. {date}",
          sandboxModeTooltip: "This simulation runs in a sandbox mode",
          immersiveModeTooltip: "This simulation runs in immersive mode",
          chatModeTooltip: "This simulation runs in chat mode",
        },
      },
    },
    "ru-RU": {
      saves: {
        save: {
          updatedAt: "Обн. {date}",
          sandboxModeTooltip: "Эта симуляция запущена в режиме песочницы",
          immersiveModeTooltip: "Эта симуляция запущена в режиме погружения",
          chatModeTooltip: "Эта симуляция запущена в режиме чата",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.group.flex.flex-col
  .relative.aspect-video.w-full.overflow-hidden
    img.h-full.w-full.object-cover.transition(
      v-if="screenshotUrl || scenarioCoverUrl"
      :src="nonNullable(screenshotUrl || scenarioCoverUrl)"
      :class="{ 'blur-sm scale-105': simulation?.mode === Mode.Chat }"
    )
    Placeholder.h-full.w-full.border-b(v-else)

    ul.absolute.bottom-0.left-0.z-10.flex.h-full.w-full.flex-col-reverse.gap-1.overflow-y-scroll.p-2(
      v-if="scenario && latestMessage"
    )
      Message(:key="latestMessage.id" :scenario :message="latestMessage")

  .flex.flex-col.p-3(v-if="simulation?.updatedAt")
    RichTitle
      template(#default)
        span.text-xs.leading-tight.text-gray-500 {{ t("saves.save.updatedAt", { date: simulation.updatedAt.toLocaleString() }) }}
      template(#extra)
        .flex.gap-1
          SandboxModeIcon.cursor-help(
            v-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE && simulation.sandbox"
            :size="16"
            v-tooltip="t('saves.save.sandboxModeTooltip')"
          )
          ImmersiveModeIcon.cursor-help(
            v-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE && simulation?.mode === Mode.Immersive"
            :size="16"
            v-tooltip="t('saves.save.immersiveModeTooltip')"
          )
          ChatModeIcon.cursor-help(
            v-else-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE"
            :size="16"
            v-tooltip="t('saves.save.chatModeTooltip')"
          )
</template>
