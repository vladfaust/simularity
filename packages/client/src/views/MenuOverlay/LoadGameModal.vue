<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import { HistoryIcon } from "lucide-vue-next";
import SavesVue from "@/views/MenuOverlay/Saves.vue";

defineProps<{
  open: boolean;
}>();

defineEmits<{
  (event: "close"): void;
}>();
</script>

<template lang="pug">
Modal.max-h-full.w-full.max-w-4xl.overflow-hidden.rounded-lg(
  :open
  @close="$emit('close')"
  title="Load game"
)
  template(#icon)
    HistoryIcon(:size="20")
  SavesVue
</template>
