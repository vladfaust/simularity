<script setup lang="ts">
import * as storage from "@/lib/storage";
import * as path from "@tauri-apps/api/path";
import { asyncComputed, useClipboard } from "@vueuse/core";
import {
  BrainCogIcon,
  CopyCheckIcon,
  CopyIcon,
  Loader2Icon,
  MemoryStickIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";

const props = defineProps<{
  model: storage.llm.CachedModel | { path: string };
  selected: boolean;
}>();

const clipboard = useClipboard();

const emit = defineEmits<{
  (event: "select"): void;
}>();

const name = asyncComputed(() => path.basename(props.model.path));
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  .flex.items-center.justify-between.gap-1
    span.w-full.cursor-pointer.overflow-hidden.text-nowrap.text-center.font-semibold.leading-tight.tracking-wide(
      @click="clipboard.copy(name)"
      :title="name"
    ) {{ name }}
    button(@click="clipboard.copy(name)" :disabled="clipboard.copied.value")
      CopyCheckIcon.text-success-500(v-if="clipboard.copied.value" :size="20")
      CopyIcon.cursor-pointer(v-else :size="20")

  //- Params.
  .flex.flex-wrap.items-center.justify-center.gap-x-2.text-sm
    .flex.gap-1
      ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
      .flex.gap-1
        span.font-semibold Context:
        span(v-if="'contextSize' in model") {{ prettyBytes(model.contextSize, { space: false, binary: true }).slice(0, -2) }}
        Loader2Icon.animate-spin.self-center(v-else :size="16")

    .flex.gap-1
      BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
      .flex.gap-1
        span.font-semibold Size:
        span(v-if="'nParams' in model") {{ prettyBytes(model.nParams, { space: false }).slice(0, -1) }}
        Loader2Icon.animate-spin.self-center(v-else :size="18")

    .flex.gap-1
      MemoryStickIcon.self-center(:size="18" :stroke-width="2.5")
      .flex.gap-1
        span.font-semibold RAM:
        span(v-if="'ramSize' in model") {{ prettyBytes(model.ramSize, { space: false }) }}
        Loader2Icon.animate-spin.self-center(v-else :size="18")

  //- Buttons
  button.btn.btn-sm.w-full.rounded.transition-transform.pressable(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
    :disabled="!('contextSize' in model)"
  )
    span {{ selected ? "Selected" : "Select" }}
</template>
