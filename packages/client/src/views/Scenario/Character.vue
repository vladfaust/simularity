<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import { Scenario } from "@/lib/simulation/scenario";
import { CrownIcon } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  scenario: Scenario;
  characterId: string;
  character: Scenario["characters"][string];
}>();

const isMainCharacter = computed(
  () => props.scenario.defaultCharacterId === props.characterId,
);
</script>

<template lang="pug">
.flex.w-full.divide-x
  CharacterPfp.h-24(:character :scenario class="hover:brightness-105")

  .flex.w-full.flex-col.p-2
    .flex.items-center.gap-1
      span.font-semibold.leading-tight(:style="{ color: character.color }") {{ character.name }}
      CrownIcon.fill-primary-500.text-primary-500(
        v-if="isMainCharacter"
        :size="16"
        title="Main character"
      )
    p.text-sm.leading-tight {{ character.about }}
</template>
