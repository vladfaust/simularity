<script setup lang="ts">
import Placeholder from "@/components/Placeholder.vue";
import { Scenario, Simulation } from "@/lib/simulation";
import { asyncComputed } from "@vueuse/core";
import { computed } from "vue";
import CharacterAvatar from "@/components/CharacterAvatar.vue";
import { ref } from "vue";

const { simulation, characterId, character } = defineProps<{
  simulation: Simulation;
  characterId: string;
  character: Scenario["characters"][string];
}>();

const pfpUrl = asyncComputed(() =>
  character.pfpPath
    ? simulation.scenario.resourceUrl(character.pfpPath)
    : undefined,
);

const onStageCharacter = computed(() =>
  simulation.state.stage.value.characters.find((c) => c.id === characterId),
);

const isOnStage = computed(() => !!onStageCharacter.value);
const onStageOutfitId = computed(() => onStageCharacter.value?.outfitId);
const onStageExpressionId = computed(
  () => onStageCharacter.value?.expressionId,
);

const selectedOutfitId = ref<string>(
  onStageOutfitId.value || simulation.scenario.defaultOutfitId(characterId),
);
const selectedExpressionId = ref<string>(
  onStageExpressionId.value ||
    simulation.scenario.defaultExpressionId(characterId),
);
const sceneBgUrl = asyncComputed(() =>
  simulation.scenario.resourceUrl(
    simulation.scenario.ensureScene(simulation.state.stage.value.sceneId).bg,
  ),
);

function selectOutfitId(outfitId: string) {
  selectedOutfitId.value = outfitId;

  if (onStageCharacter.value) {
    simulation.state.setOutfit(characterId, outfitId);
  }
}

function selectExpressionId(expressionId: string) {
  selectedExpressionId.value = expressionId;

  if (onStageCharacter.value) {
    simulation.state.setExpression(characterId, expressionId);
  }
}

function addToStage() {
  simulation.state.addCharacter(
    characterId,
    selectedOutfitId.value,
    selectedExpressionId.value,
  );
}

function removeFromStage() {
  simulation.state.removeCharacter(characterId);
}
</script>

<template lang="pug">
.grid.grid-cols-2.divide-x.overflow-y-hidden
  //- Info.
  .flex.h-full.flex-col.items-center.gap-1.overflow-y-auto.p-3
    //- Pfp.
    img.aspect-square.w-32.rounded-lg.border-2.border-white.object-cover.shadow-lg(
      v-if="pfpUrl"
      :src="pfpUrl"
    )
    Placeholder.aspect-square.w-32.rounded-lg.border-2.border-white.shadow-lg(
      v-else
    )

    //- Info.
    span.mt-2.text-lg.font-semibold.leading-tight(
      :style="{ color: character.color }"
    ) {{ character.name }}
    p.text-center.text-sm.leading-tight {{ character.about }}

    //- Add/remove from stage button.
    button.btn.btn-md.btn-error.btn-pressable.mt-1.rounded(
      v-if="isOnStage"
      @click="removeFromStage"
    ) Remove from stage
    button.btn.btn-md.btn-primary.btn-pressable.mt-1.rounded(
      v-else
      @click="addToStage"
    ) Add to stage

    //- Outfits.
    h1.font-semibold.tracking-wide Outfits
    ul.grid.w-full.grid-cols-3.gap-2
      CharacterAvatar.h-24.w-full.cursor-pointer.rounded-lg.border-2.shadow-lg.transition-transform.pressable-sm(
        v-for="outfitId of Object.keys(character.outfits)"
        :key="outfitId"
        :class="{ 'border-white': outfitId !== selectedOutfitId, 'border-primary-500': outfitId === selectedOutfitId }"
        :scenario="simulation.scenario"
        :character-id
        :outfit-id
        :expression-id="selectedExpressionId"
        @click="selectOutfitId(outfitId)"
      )

    //- Expressions.
    h1.font-semibold.tracking-wide Expressions
    ul.grid.w-full.grid-cols-3.gap-2
      CharacterAvatar.h-24.w-full.cursor-pointer.rounded-lg.border-2.shadow-lg.transition-transform.pressable-sm(
        v-for="expressionId of (character.expressions)"
        :key="expressionId"
        :class="{ 'border-white': expressionId !== selectedExpressionId, 'border-primary-500': expressionId === selectedExpressionId }"
        :scenario="simulation.scenario"
        :character-id
        :outfit-id="selectedOutfitId"
        :expression-id
        @click="selectExpressionId(expressionId)"
      )

  //- Render.
  .relative.grid.h-full.w-full
    img.absolute.h-full.w-full.object-cover(:src="sceneBgUrl")
    CharacterAvatar.absolute.w-full(
      :scenario="simulation.scenario"
      :character-id
      :outfit-id="selectedOutfitId"
      :expression-id="selectedExpressionId"
    )
</template>
