<script setup lang="ts">
import { type StateCommand } from "@/lib/simulation/state/commands";
import { computed } from "vue";

const { command } = defineProps<{
  command: StateCommand;
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
span.text-shadow.rounded.p-2.font-mono.text-sm.leading-none.text-white(
  :style="{ backgroundColor: bgColor }"
) {{ command.name }}({{ Object.values(command.args).join(", ") }})
</template>
