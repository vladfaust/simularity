<script lang="ts">
export type SimpleMessage = {
  id: number;
  characterId: string | null;
  text: string;
  clockMinutes: number;
  createdAt: Date;
};
</script>

<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import type { Scenario } from "@/lib/simulation";
import RichText from "@/views/Simulation/Update/RichText.vue";
import { BotIcon } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  scenario: Scenario;
  message: SimpleMessage;
}>();

const character = computed(() =>
  props.message.characterId
    ? props.scenario.ensureCharacter(props.message.characterId)
    : null,
);
</script>

<template lang="pug">
.flex.gap-1
  CharacterPfp.h-5.rounded.border.bg-white(
    v-if="character"
    :scenario
    :character
  )
  .grid.aspect-square.h-5.place-items-center.rounded.border.bg-white(v-else)
    BotIcon.text-secondary-500(:size="14")

  RichText.rounded-r.rounded-bl.bg-white.text-xs.leading-none.opacity-90.shadow-sm(
    as="p"
    class="px-1.5 py-1.5 group-hover:opacity-100"
    :text="message.text"
  )
</template>
