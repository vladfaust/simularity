<script setup lang="ts">
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { XIcon } from "lucide-vue-next";

defineOptions({
  inheritAttrs: false,
});

defineProps<{
  open: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();
</script>

<template lang="pug">
Dialog.relative.z-50.w-screen.overflow-hidden(
  :open="open"
  @close="emit('close')"
  :unmount="false"
  :static="true"
)
  TransitionRoot(:show="open" as="template")
    TransitionChild.fixed.inset-0.grid.place-items-center.overflow-hidden.p-4.backdrop-blur(
      class="bg-black/30"
      enter="duration-200 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-200 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      DialogPanel.flex.flex-col.overflow-y-hidden(v-bind="$attrs")
        slot(name="header" v-if="title")
          .flex.items-center.justify-between.gap-2.border-b.p-3
            h1.flex.shrink-0.items-center.gap-1
              slot(name="icon")
              span.text-lg.font-semibold.leading-tight.tracking-wide {{ title }}
            .h-0.w-full.shrink.border-b
            button.btn-pressable.btn-neutral.btn.aspect-square.rounded.p-1(
              @click="emit('close')"
            )
              XIcon(:size="20")

        slot(name="default")
</template>
