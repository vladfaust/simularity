<script lang="ts">
export type LlmModelRecommedation = {
  type: "llm";
  task: LlmAgentId;
  name: string;
  description: string;
  nParams: number;
  contextSize: number;
  hfUrl?: string;
  quants: Record<
    string,
    {
      name: string;
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
</script>

<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import type { LlmAgentId } from "@/lib/storage/llm";
import { prettyNumber } from "@/lib/utils";
import { shell } from "@tauri-apps/api";
import {
  BrainCogIcon,
  ChevronDownIcon,
  DownloadCloudIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed, ref } from "vue";

const { model } = defineProps<{
  model: LlmModelRecommedation;
}>();

const showAllQuants = ref(false);
const quants = computed(() =>
  showAllQuants.value
    ? Object.values(model.quants)
    : Object.values(model.quants).slice(0, 1),
);

function openHfUrl() {
  if (!model.hfUrl) return;
  shell.open(model.hfUrl);
}

function openQuantHfUrl(quant: LlmModelRecommedation["quants"][string]) {
  shell.open(quant.urls.hf);
}
</script>

<template lang="pug">
li.flex.flex-col.divide-y
  .flex.flex-col.gap-1.p-3
    CustomTitle(:title="model.name")
      template(#extra v-if="model.hfUrl")
        button.btn-pressable(@click="openHfUrl") 🤗
    p.text-sm.leading-tight {{ model.description }}

    //- Params.
    .flex.flex-wrap.items-center.gap-x-2.text-sm
      //- nParams.
      .flex.gap-1
        BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Params:
          span {{ prettyNumber(model.nParams, { space: false }) }}p

      //- Context size.
      .flex.gap-1
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Context:
          span {{ prettyNumber(model.contextSize, { space: false }) }}t

  //- Quants.
  ul.flex.flex-col.gap-2.p-2
    li.flex.items-center.gap-2(v-for="quant in quants")
      button.btn.btn-pressable.btn-primary.btn-sm.rounded-lg(
        @click="openQuantHfUrl(quant)"
      )
        DownloadCloudIcon(:size="20")
        | Download
      span.text-xs.leading-none {{ quant.name }}
      span.flex.items-center.gap-1.border-l.px-2.py-1.text-xs.leading-none
        | {{ prettyBytes(quant.ramSize, { space: false, binary: false }) }}

    button.btn.gap-1.rounded.bg-neutral-100.p-1.text-sm.font-medium.transition.pressable-sm(
      v-if="Object.keys(model.quants).length > 1"
      @click="showAllQuants = !showAllQuants"
    )
      ChevronDownIcon(:size="16" :class="{ 'rotate-180': showAllQuants }")
      span Show
      span(v-if="showAllQuants") less
      span(v-else) more
</template>
