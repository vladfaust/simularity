<script setup lang="ts">
import { type StateCommand } from "@/lib/simulation/state";
import { CircleMinusIcon } from "lucide-vue-next";
import { computed } from "vue";

const { command } = defineProps<{
  command: StateCommand;
  canRemove?: boolean;
}>();

const emit = defineEmits<{
  (event: "remove"): void;
}>();

const bgColor = computed(() => {
  switch (command.name) {
    case "setExpression":
      return "rgb(25, 151, 255)";
    case "addCharacter":
      return "rgb(255, 168, 47)";
    case "setScene":
      return "rgb(228, 60, 195)";
    case "setOutfit":
      return "rgb(178, 35, 255)";
    default:
      return "gray";
  }
});
</script>

<template lang="pug">
.text-shadow.flex.items-center.justify-between.rounded.p-2(
  :style="{ backgroundColor: bgColor }"
)
  span.w-full.break-all.font-mono.text-sm.leading-none.text-white {{ command.name }}({{ Object.values(command.args).join(", ") }})
  button.btn.btn-pressable.shrink-0(v-if="canRemove" @click="emit('remove')")
    CircleMinusIcon.text-white.drop-shadow(:size="16")
</template>
