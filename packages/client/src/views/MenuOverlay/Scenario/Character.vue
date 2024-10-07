<script setup lang="ts">
import CharacterPfp from "@/components/CharacterPfp.vue";
import type { Scenario } from "@/lib/scenario";
import { appLocale } from "@/lib/storage";
import { translationWithFallback } from "@/logic/i18n";
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
.flex.w-full
  CharacterPfp.h-28.rounded-lg(:character :scenario class="hover:brightness-105")

  .flex.w-full.flex-col.px-3.py-2
    .flex.items-center.gap-1
      span.font-semibold.leading-tight(:style="{ color: character.color }") {{ translationWithFallback(character.name, appLocale) }}
      CrownIcon.fill-primary-500.text-primary-500(
        v-if="isMainCharacter"
        :size="16"
        title="Main character"
      )
    p.text-sm.leading-tight {{ translationWithFallback(character.about, appLocale) }}
</template>
