<script setup lang="ts">
import CustomTitle from "@/components/RichForm/RichTitle.vue";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import * as path from "@tauri-apps/api/path";
import { asyncComputed, useClipboard } from "@vueuse/core";
import {
  BrainCogIcon,
  CircleMinusIcon,
  FolderOpenIcon,
  Loader2Icon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed } from "vue";

const props = defineProps<{
  model: storage.llm.CachedModel | { path: string };
  selected: boolean;
}>();

const clipboard = useClipboard();

const emit = defineEmits<{
  (event: "select"): void;
  (event: "remove"): void;
}>();

const name = asyncComputed(() => path.basename(props.model.path));
const cached = computed(() => "modelHash" in props.model);

async function showInFileManager() {
  await tauri.utils.fileManagerOpen(props.model.path);
}
</script>

<template lang="pug">
.flex.flex-col.divide-y
  .flex.flex-col.gap-1.overflow-x-hidden.p-3
    CustomTitle(:hide-border="true")
      .flex.w-full.items-center.gap-1.overflow-hidden
        span.overflow-x-hidden.text-nowrap.font-semibold.leading-snug.tracking-wide {{ name }}

    //- Description.
    p.cursor-copy.break-all.font-mono.text-sm.italic.leading-tight.transition-transform.pressable-sm(
      @click="clipboard.copy(model.path)"
    ) {{ model.path }}

    //- Params.
    .flex.flex-wrap.items-center.gap-x-2.text-sm
      //- nParams.
      .flex.gap-1
        BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Params:
          span(v-if="'nParams' in model") {{ prettyNumber(model.nParams, { space: false }) }}p
          Loader2Icon.animate-spin.self-center(v-else :size="18")

      //- Context size.
      .flex.gap-1
        ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
        .flex.gap-1
          span.font-semibold Context:
          span(v-if="'contextSize' in model") {{ prettyNumber(model.contextSize, { space: false }) }}t
          Loader2Icon.animate-spin.self-center(v-else :size="16")

  .grid.gap-2.p-3(style="grid-template-columns: 6rem min-content auto")
    //- Select button.
    button.btn.btn-pressable.btn-neutral.btn-sm.rounded(
      :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
      :disabled="!cached"
      @click="emit('select')"
    )
      template(v-if="selected") Selected
      template(v-else) Select

    .flex.items-center
      span.rounded.border.px-1.text-xs.leading-none(
        class="py-0.5"
        v-if="'ramSize' in model"
      )
        | {{ prettyBytes(model.ramSize, { space: false, binary: false }) }}
      Loader2Icon.animate-spin.self-center(v-else :size="18")

    //- Actions.
    .flex.items-center.gap-2
      .w-full.border-b

      .flex.items-center.gap-1
        //- Open in file manager.
        button.btn.btn-pressable(
          title="Open in file manager"
          @click="showInFileManager()"
        )
          FolderOpenIcon(:size="18")

        //- Remove.
        button.btn.btn-pressable(
          v-if="cached"
          class="hover:text-error-500"
          title="Remove model"
          @click="emit('remove')"
        )
          CircleMinusIcon(:size="18")
</template>
