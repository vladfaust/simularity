<script lang="ts">
export type AvailableModel = {
  name: string;
  description: string;
  nParams: number;
  contextSize: number;
  hfUrl?: string;
  quants: Record<
    string,
    {
      hash: {
        sha256: string;
      };
      ramSize: number;
      urls: {
        hf: string;
      };
    }
  >;
};

export type WellKnownModelProps = {
  recommendationModel: AvailableModel;
  cachedModelsByQuants: Record<
    string,
    {
      model: storage.llm.CachedModel;
      selected: Ref<boolean>;
      removeDeletesFile: boolean;
    }
  >;
  showUncachedQuants?: boolean;
};
</script>

<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import { shell } from "@tauri-apps/api";
import {
  BrainCogIcon,
  ChevronDownIcon,
  CircleMinusIcon,
  FolderOpenIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed, ref, type Ref } from "vue";

const WELL_KNOWN_QUANTS: Record<
  string,
  {
    name: string;
    help?: string;
  }
> = {
  q3km: {
    name: "Q3_K_M",
    help: "Very small, high quality loss.",
  },
  q4km: {
    name: "Q4_K_M",
    help: "Medium, balanced quality.",
  },
  q5km: {
    name: "Q5_K_M",
    help: "Large, very low quality loss.",
  },
  q6k: {
    name: "Q6_K",
    help: "Very large, extremely low quality loss.",
  },
};

const props = defineProps<WellKnownModelProps>();
const emit = defineEmits<{
  (event: "remove", quantId: string, deleteFile: boolean): void;
  (event: "select", quantId: string): void;
}>();

const showAllQuants = ref(false);
const cachedQuants = computed(() =>
  Object.fromEntries(
    Object.entries(props.recommendationModel.quants).filter(([_, quant]) =>
      Object.entries(props.cachedModelsByQuants).some(
        ([_, cachedModel]) =>
          cachedModel.model.modelHash.sha256 === quant.hash.sha256,
      ),
    ),
  ),
);
const gotAnyUncachedQuants = computed(
  () =>
    Object.keys(props.recommendationModel.quants).length >
    Object.keys(cachedQuants.value).length,
);

/**
 * If `showAllQuants` is true, show all quants.
 * Otherwise, show either the quants that are cached or the first quant.
 */
const shownQuants = computed(() =>
  props.showUncachedQuants && showAllQuants.value
    ? props.recommendationModel.quants
    : Object.entries(props.cachedModelsByQuants).length
      ? cachedQuants.value
      : Object.fromEntries(
          Object.entries(props.recommendationModel.quants).slice(0, 1),
        ),
);

function openHfUrl() {
  if (!props.recommendationModel.hfUrl) return;
  shell.open(props.recommendationModel.hfUrl);
}

function download(quantId: string) {
  const quant = props.recommendationModel.quants[quantId];
  shell.open(quant.urls.hf);
}

async function showInFileManager(quantId: string) {
  const cachedModel = props.cachedModelsByQuants[quantId];
  await tauri.utils.fileManagerOpen(cachedModel.model.path);
}
</script>

<template lang="pug">
li.flex.flex-col.divide-y
  .flex.flex-col.p-3
    CustomTitle(:title="recommendationModel.name")
      template(#extra v-if="recommendationModel.hfUrl")
        button.btn-pressable(@click="openHfUrl") 🤗

    p.text-sm.leading-snug {{ recommendationModel.description }}

    //- Params.
    .mt-1.flex.flex-wrap.items-center.gap-x-2.text-sm
      //- nParams.
      .flex.gap-1
        BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Params:
          span {{ prettyNumber(recommendationModel.nParams, { space: false }) }}p

      //- Context size.
      .flex.gap-1
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Context:
          span {{ prettyNumber(recommendationModel.contextSize, { space: false }) }}t

  //- Quants.
  .grid.gap-2.p-3(
    style="grid-template-columns: 6rem repeat(2, min-content) auto"
  )
    template(v-for="[quantId, quant] in Object.entries(shownQuants)")
      //- Select button.
      template(v-if="cachedModelsByQuants[quantId]")
        button.btn.btn-pressable.btn-neutral.btn-sm.rounded(
          :class="{ 'btn-primary': cachedModelsByQuants[quantId].selected.value, 'btn-neutral': !cachedModelsByQuants[quantId].selected.value }"
          @click="emit('select', quantId)"
        )
          template(v-if="cachedModelsByQuants[quantId].selected.value")
            span Selected
          template(v-else)
            span Select

      //- Download button.
      button.btn.btn-pressable.btn-neutral.btn-sm.rounded(
        v-else
        @click="download(quantId)"
      )
        | Download

      .flex.items-center
        span.text-sm.leading-none(
          v-tooltip="WELL_KNOWN_QUANTS[quantId]?.help"
          :class="{ 'cursor-help underline decoration-dotted': WELL_KNOWN_QUANTS[quantId]?.help }"
        ) {{ WELL_KNOWN_QUANTS[quantId]?.name || quantId }}

      .flex.items-center
        span.rounded.border.px-1.text-xs.leading-none(class="py-0.5")
          | {{ prettyBytes(cachedModelsByQuants[quantId]?.model.ramSize ?? quant.ramSize, { space: false, binary: false }) }}

      //- Actions.
      .flex.items-center.gap-2(v-if="cachedModelsByQuants[quantId]")
        .w-full.border-b

        .flex.items-center.gap-1
          //- Open in file manager.
          button.btn.btn-pressable(
            title="Open in file manager"
            @click="showInFileManager(quantId)"
          )
            FolderOpenIcon(:size="18")

          //- Remove.
          button.btn.btn-pressable(
            class="hover:text-error-500"
            :title="cachedModelsByQuants[quantId].removeDeletesFile ? 'Delete model file' : 'Remove model from list'"
            @click="emit('remove', quantId, cachedModelsByQuants[quantId].removeDeletesFile)"
          )
            CircleMinusIcon(:size="18")

    button.btn.col-span-full.gap-1.rounded.border.bg-neutral-100.px-2.text-sm.font-semibold.transition.pressable-sm(
      class="py-1.5"
      v-if="Object.keys(recommendationModel.quants).length > 1 && gotAnyUncachedQuants && showUncachedQuants"
      @click="showAllQuants = !showAllQuants"
    )
      ChevronDownIcon(:size="18" :class="{ 'rotate-180': showAllQuants }")
      span Show
      span(v-if="showAllQuants") less
      span(v-else) more
</template>
