<script setup lang="ts">
import { translateWithFallback } from "@/lib/logic/i18n";
import { useRemoteScenarioQuery } from "@/lib/queries";
import { appLocale } from "@/store";
import { CrownIcon } from "lucide-vue-next";
import { computed } from "vue";
import CharacterPfp from "./CharacterPfp.vue";

const { scenarioId, characterId } = defineProps<{
  scenarioId: string;
  characterId: string;
}>();

const { data: scenario } = useRemoteScenarioQuery(scenarioId);
const character = computed(() => scenario.value?.characters[characterId]);

const isMainCharacter = computed(() =>
  scenario.value
    ? Object.keys(scenario.value.characters)[0] === characterId
    : false,
);
</script>

<template lang="pug">
.flex.w-full
  CharacterPfp.h-28.rounded-lg(:character-id :scenario-id class="hover:brightness-105")

  .flex.w-full.flex-col.px-3.py-2(v-if="character")
    .flex.items-center.gap-1
      span.font-semibold.leading-tight(:style="{ color: character.color }") {{ translateWithFallback(character.name, appLocale) }}
      CrownIcon.fill-primary-500.text-primary-500(
        v-if="isMainCharacter"
        :size="16"
        title="Main character"
      )
    p.text-sm.leading-tight {{ translateWithFallback(character.about, appLocale) }}
</template>
