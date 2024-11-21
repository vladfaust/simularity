<script setup lang="ts">
import Alert from "@/components/Alert.vue";
import EpisodeCard from "@/components/EpisodeCard.vue";
import ImmersiveModeIcon from "@/components/Icons/ImmersiveModeIcon.vue";
import SandboxModeIcon from "@/components/Icons/SandboxModeIcon.vue";
import Modal from "@/components/Modal.vue";
import Placeholder from "@/components/Placeholder.vue";
import RichSelect from "@/components/RichForm/RichSelect.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import RichToggle from "@/components/RichForm/RichToggle.vue";
import ScenarioCard from "@/components/ScenarioCard.vue";
import { env } from "@/env";
import { trackEvent } from "@/lib/plausible";
import {
  LocalImmersiveScenario,
  RemoteScenario,
  type Scenario,
} from "@/lib/scenario";
import { Mode, Simulation } from "@/lib/simulation";
import * as storage from "@/lib/storage";
import { localesToSelectValues, translationWithFallback } from "@/logic/i18n";
import {
  allSavesQueryKey,
  useWellKnownLlmModelsQuery,
  type WellKnownModel,
} from "@/queries";
import router, { routeLocation } from "@/router";
import { useQueryClient } from "@tanstack/vue-query";
import { asyncComputed, useElementSize, watchImmediate } from "@vueuse/core";
import { LanguagesIcon, SparkleIcon } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const queryClient = useQueryClient();

const props = defineProps<{
  open: boolean;
  scenario: Scenario;
  episodeId?: string;
}>();

const emit = defineEmits<{
  (event: "selectEpisode", episodeId: string): void;
  (event: "close"): void;
}>();

const selectedEpisodeId = ref<string>(
  props.episodeId ?? props.scenario.defaultEpisodeId,
);

const selectedEpisode = computed(
  () => props.scenario.episodes[selectedEpisodeId.value],
);

const selectedEpisodeImageUrl = asyncComputed(() =>
  selectedEpisode.value?.image
    ? props.scenario.resourceUrl(selectedEpisode.value.image.path)
    : null,
);

const immersiveMode = ref(
  env.VITE_EXPERIMENTAL_IMMERSIVE_MODE
    ? props.scenario instanceof LocalImmersiveScenario
    : false,
);
const sandboxMode = ref(true);

const detailsRef = ref<HTMLElement | null>(null);
const detailsSize = useElementSize(detailsRef);
const helperRef = ref<HTMLElement | null>(null);
const helperSize = useElementSize(helperRef);
const { data: wellKnownWriterModels } = useWellKnownLlmModelsQuery("writer");
const writerDriverConfig = storage.llm.useDriverConfig("writer");

/**
 * If the selected model is a well-known model, return it.
 */
const selectedWellKnownWriterModel = computed<WellKnownModel | undefined>(
  () => {
    if (!wellKnownWriterModels.value) return;

    if (writerDriverConfig.value?.type === "local") {
      const cachedModel = storage.llm.getCachedModel(
        writerDriverConfig.value.modelPath,
      );

      if (cachedModel) {
        const wellKnownModel = Object.entries(wellKnownWriterModels.value).find(
          ([_, wellKnownModel]) =>
            Object.entries(wellKnownModel.quants).find(
              ([_, quant]) =>
                quant.hash.sha256 === cachedModel.modelHash.sha256,
            ),
        );

        if (wellKnownModel) {
          return wellKnownModel[1];
        }
      }
    } else if (writerDriverConfig.value?.type === "remote") {
      // FIXME: Remote model shall include locale information.
      return undefined;
    }
  },
);

const scenarioLocalesFilteredBySelectedModel = computed<Intl.Locale[]>(() => {
  if (!selectedWellKnownWriterModel.value) {
    return props.scenario.locales;
  } else {
    return props.scenario.locales.filter((l) =>
      selectedWellKnownWriterModel.value?.locales?.includes(l.toString()),
    );
  }
});

/**
 * Get default chat locale string for the selected model and scenario.
 */
function getDefaultChatLocalString() {
  return scenarioLocalesFilteredBySelectedModel.value.find(
    (l) => l.toString() === storage.chatLocale.value.toString(),
  )
    ? storage.chatLocale.value.toString()
    : scenarioLocalesFilteredBySelectedModel.value.find(
          (l) => l.toString() === storage.appLocale.value.toString(),
        )
      ? storage.appLocale.value.toString()
      : scenarioLocalesFilteredBySelectedModel.value[0].toString();
}

const chatLocaleModelRef = ref(getDefaultChatLocalString());

const chatLocale = computed<Intl.Locale>({
  get: () => new Intl.Locale(chatLocaleModelRef.value),
  set: (value) => (chatLocaleModelRef.value = value.toString()),
});

async function play(locale: Intl.Locale, episodeId?: string | null) {
  const simulationId = await Simulation.create(
    props.scenario.id,
    immersiveMode.value ? Mode.Immersive : Mode.Chat,
    sandboxMode.value,
    locale,
    episodeId ?? undefined,
  );

  queryClient.invalidateQueries({ queryKey: allSavesQueryKey() });

  trackEvent("simulations/create", {
    props: {
      scenarioId: props.scenario.id,
      episodeId: episodeId ?? "",
      immersive: immersiveMode.value,
      sandbox: sandboxMode.value,
    },
  });

  router.push(
    routeLocation({
      name: "Simulation",
      params: { simulationId },
    }),
  );
}

watch(props, (props) => {
  selectedEpisodeId.value = props.episodeId ?? props.scenario.defaultEpisodeId;
});

watchImmediate(selectedEpisodeId, (episodeId) => {
  // Track episode selection.
  trackEvent("newGameModal", {
    props: {
      scenarioId: props.scenario.id,
      episodeId,
    },
  });
});

watch(
  [
    scenarioLocalesFilteredBySelectedModel,
    storage.appLocale,
    storage.chatLocale,
  ],
  () => {
    chatLocaleModelRef.value = getDefaultChatLocalString();
  },
);

const { t } = useI18n({
  messages: {
    "en-US": {
      newGameModal: {
        newGame: "New game",
        startGame: "Start game",
        downloadScenario: "Download scenario to play",
        chatLanguage: "Language",
        unsupportedLanguage:
          "The currently selected model ({model}) was not trained for this language. Expect suboptimal results.",
        immersiveMode: "Immersive mode",
        immersiveModeHelp:
          "In immersive mode, you can play the simulation as a visual novel.",
        sandboxMode: "Sandbox mode",
        sandboxModeHelp:
          "In sandbox mode, you get full control over the simulation.",
      },
    },
    "ru-RU": {
      newGameModal: {
        newGame: "Новая игра",
        startGame: "Начать игру",
        downloadScenario: "Скачайте сценарий для начала игры",
        chatLanguage: "Язык",
        unsupportedLanguage:
          "Выбранная модель ({model}) не была обучена для этого языка. Вероятно, результаты будут посредственными.",
        immersiveMode: "Режим погружения",
        immersiveModeHelp:
          "В режиме погружения вы можете играть в симуляцию как визуальный роман.",
        sandboxMode: "Режим песочницы",
        sandboxModeHelp:
          "В режиме песочницы у вас есть полный контроль над симуляцией.",
      },
    },
  },
});
</script>

<template lang="pug">
Modal.max-h-full.w-full.max-w-5xl.rounded-lg(
  class="bg-white/90"
  :open
  @close="emit('close')"
  :title="t('newGameModal.newGame')"
)
  template(#icon)
    SparkleIcon(:size="22")

  .relative.max-h-full.overflow-hidden(
    :style="{ height: 'calc(' + detailsSize.height.value + 'px)' }"
  )
    .pointer-events-none.absolute.h-full.w-full(ref="helperRef")
    .grid.max-h-full.grid-cols-5.divide-x.overflow-y-hidden(
      :style="{ height: helperSize.height.value + 'px' }"
    )
      //- Episode selection.
      .col-span-2.flex.h-full.flex-col.overflow-y-scroll.contain-size
        .border-b.p-3
          ScenarioCard.overflow-hidden.rounded-lg.bg-white.shadow-lg.shadow-lg(
            :scenario
            :always-hide-details="true"
            layout="list"
          )

        .grid.max-h-full.grid-cols-2.gap-2.p-3
          EpisodeCard.h-max.cursor-pointer.rounded-lg.border-4.bg-white.shadow-lg(
            v-for="episodeId in Object.keys(scenario.episodes)"
            :scenario
            :episode-id
            :selected="selectedEpisodeId === episodeId"
            @click.stop="selectedEpisodeId = episodeId; emit('selectEpisode', episodeId)"
            :class="{ 'border-primary-500': selectedEpisodeId === episodeId, 'border-white': selectedEpisodeId !== episodeId }"
          )

      //- Episode details.
      .col-span-3.h-full.overflow-y-scroll
        .flex.h-max.flex-col.divide-y(ref="detailsRef")
          .flex.flex-col.gap-2.p-3
            img.aspect-video.rounded-lg.border-4.border-white.object-cover.shadow-lg(
              v-if="selectedEpisodeImageUrl"
              :src="selectedEpisodeImageUrl"
            )
            Placeholder.aspect-video.w-full.rounded-lg.border-4.bg-white.shadow-lg.shadow-lg(
              v-else
            )

            .mt-1.px-1
              RichTitle(
                :title="translationWithFallback(selectedEpisode.name, storage.appLocale.value)"
                :hide-border="true"
              )
              p.leading-snug {{ translationWithFallback(selectedEpisode.about, storage.appLocale.value) }}

          .flex.flex-col.gap-2.p-3
            RichSelect#chat-language(
              :title="t('newGameModal.chatLanguage')"
              v-model="chatLocaleModelRef"
              :values="localesToSelectValues(scenario.locales)"
            )
              template(#icon)
                LanguagesIcon(:size="16")

            Alert(
              v-if="selectedWellKnownWriterModel && !selectedWellKnownWriterModel?.locales?.includes(chatLocaleModelRef)"
              type="warn"
            )
              i18n-t(:keypath="'newGameModal.unsupportedLanguage'")
                template(#model)
                  | {{ selectedWellKnownWriterModel?.name }}

            template(
              v-if="env.VITE_EXPERIMENTAL_IMMERSIVE_MODE && !(scenario instanceof RemoteScenario)"
            )
              RichToggle#immersive(
                :title="t('newGameModal.immersiveMode')"
                :help="t('newGameModal.immersiveModeHelp')"
                v-model="immersiveMode"
                :disabled="!(scenario instanceof LocalImmersiveScenario)"
              )
                template(#icon)
                  ImmersiveModeIcon(:size="20")

              RichToggle#sandbox(
                :title="t('newGameModal.sandboxMode')"
                :help="t('newGameModal.sandboxModeHelp')"
                v-model="sandboxMode"
              )
                template(#icon)
                  SandboxModeIcon(:size="20")

  .col-span-full.border-t.p-3
    .btn.btn-md.w-full.rounded-lg.border.border-dashed(
      v-if="scenario instanceof RemoteScenario && true"
    )
      | {{ t("newGameModal.downloadScenario") }}
    button.btn.btn-pressable-sm.btn-primary.btn-md.w-full.rounded-lg(
      v-else
      :disabled="!selectedEpisodeId"
      @click="play(chatLocale, selectedEpisodeId)"
    )
      | {{ t("newGameModal.startGame") }}
</template>

<style lang="postcss" scoped>
._mode-button {
  @apply btn btn-sm w-full p-2;

  &._selected {
    @apply btn-primary;
  }
}
</style>
