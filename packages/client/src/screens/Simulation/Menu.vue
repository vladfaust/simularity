<script setup lang="ts">
import Settings from "@/components/Settings.vue";
import {
  Dialog,
  DialogPanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { HomeIcon, SettingsIcon } from "lucide-vue-next";
import { ref } from "vue";

defineProps<{
  open: boolean;
}>();

enum State {
  Settings,
}

const state = ref<State | null>(null);

const emit = defineEmits<{
  (event: "close"): void;
  (event: "toMainMenu"): void;
}>();

function close() {
  emit("close");

  setTimeout(() => {
    state.value = null;
  }, 500);
}
</script>

<template lang="pug">
TransitionRoot(:show="open" as="template")
  Dialog.relative.z-50(@close="close")
    TransitionChild(
      as="template"
      enter="duration-100 ease-out"
      enter-from="opacity-0"
      enter-to="opacity-100"
      leave="duration-100 ease-in"
      leave-from="opacity-100"
      leave-to="opacity-0"
    )
      .fixed.inset-0(class="bg-black/30" aria-hidden="true")
    .fixed.inset-0.grid.place-items-center.overflow-y-auto
      TransitionChild(
        as="template"
        enter="duration-100 ease-out"
        enter-from="opacity-0 scale-95"
        enter-to="opacity-100 scale-100"
        leave="duration-100 ease-in"
        leave-from="opacity-100 scale-100"
        leave-to="opacity-0 scale-95"
      )
        DialogPanel.rounded-lg.bg-white.shadow-lg(v-bind="$attrs")
          .flex.w-full.max-w-xs.flex-col.gap-2.p-3(v-if="state === null")
            button._btn.w-full(@click="emit('toMainMenu')")
              HomeIcon(:size="20")
              span Main menu
            button._btn.w-full(@click="state = State.Settings")
              SettingsIcon(:size="20")
              span Settings

          Settings(v-else-if="state === State.Settings")
</template>

<style lang="scss" scoped>
._btn {
  @apply btn btn-md btn-pressable rounded;
}
</style>
