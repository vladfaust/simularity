<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import * as resources from "@/lib/resources";
import * as storage from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { prettyNumber } from "@/lib/utils";
import { TransitionRoot } from "@headlessui/vue";
import * as path from "@tauri-apps/api/path";
import { asyncComputed, useClipboard } from "@vueuse/core";
import {
  BrainCogIcon,
  CheckIcon,
  CircleMinusIcon,
  CopyCheckIcon,
  FolderOpenIcon,
  Loader2Icon,
  MemoryStickIcon,
  ProportionsIcon,
} from "lucide-vue-next";
import prettyBytes from "pretty-bytes";
import { computed } from "vue";

const props = defineProps<{
  model: storage.llm.CachedModel | { path: string };
  selected: boolean;
  removeDeletesFile: boolean;
}>();

const clipboard = useClipboard();

const emit = defineEmits<{
  (event: "select"): void;
  (event: "remove"): void;
}>();

const name = asyncComputed(() => path.basename(props.model.path));
const canRemove = computed(() => "modelHash" in props.model);

async function showInFileManager() {
  await tauri.utils.fileManagerOpen(props.model.path);
}

async function remove() {
  if (
    props.removeDeletesFile &&
    !(await resources.confirm_(
      "Are you sure you want to remove this model? The model file will be deleted.",
      {
        title: "Delete model file?",
        okLabel: "Delete",
        type: "warning",
      },
    ))
  ) {
    console.log("Cancelled delete", props.model.path);
    return;
  }

  emit("remove");
}
</script>

<template lang="pug">
.flex.flex-col.gap-1.overflow-x-hidden.p-3
  CustomTitle
    .flex.w-full.items-center.gap-1.overflow-hidden
      //- Model name (copy path on click).
      span.block.shrink.cursor-pointer.overflow-x-hidden.text-nowrap.font-semibold.leading-snug.tracking-wide.transition(
        @click="clipboard.copy(model.path)"
        :class="{ 'text-primary-500 ': clipboard.copied.value }"
      ) {{ name }}

      //- Copied icon.
      TransitionRoot(
        :show="clipboard.copied.value"
        enter="transition-opacity duration-100 ease-in"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="transition-opacity duration-100 ease-out"
        leave-from="opacity-100 scale-100"
        leave-to="opacity-0 scale-110"
      )
        CopyCheckIcon.shrink-0.text-primary-500(
          :size="16"
          :stroke-width="2.5"
          title="Copied!"
        )

    template(#extra)
      //- Actions.
      .flex.items-center.gap-1
        //- Open in file manager.
        button.btn.btn-pressable(
          title="Open in file manager"
          @click="showInFileManager"
        )
          FolderOpenIcon(:size="18")

        //- Remove.
        button.btn.btn-pressable(
          class="hover:text-error-500"
          :title="removeDeletesFile ? 'Delete model file' : 'Remove model from list'"
          :disabled="!canRemove"
          @click="remove"
        )
          CircleMinusIcon(:size="18")

  //- Params.
  .flex.flex-wrap.items-center.gap-x-2.text-sm
    //- Context size.
    .flex.gap-1
      ProportionsIcon.self-center(:size="18" :stroke-width="2.5")
      .flex.gap-1
        span.font-semibold Context:
        span(v-if="'contextSize' in model") {{ prettyNumber(model.contextSize, { space: false }) }}t
        Loader2Icon.animate-spin.self-center(v-else :size="16")

    //- nParams.
    .flex.gap-1
      BrainCogIcon.self-center(:size="18" :stroke-width="2.5")
      .flex.gap-1
        span.font-semibold Params:
        span(v-if="'nParams' in model") {{ prettyNumber(model.nParams, { space: false }) }}p
        Loader2Icon.animate-spin.self-center(v-else :size="18")

    //- RAM.
    .flex.gap-1
      MemoryStickIcon.self-center(:size="18" :stroke-width="2.5")
      .flex.gap-1
        span.font-semibold RAM:
        span(v-if="'ramSize' in model") {{ prettyBytes(model.ramSize, { space: false }) }}
        Loader2Icon.animate-spin.self-center(v-else :size="18")

  //- Select button.
  button.btn.btn-sm.mt-1.w-full.rounded.transition-transform.pressable-sm(
    :class="{ 'btn-primary': selected, 'btn-neutral': !selected }"
    @click="$emit('select')"
    :disabled="!('contextSize' in model)"
  )
    template(v-if="selected")
      CheckIcon(:size="18")
      span Selected
    template(v-else)
      span Select
</template>
