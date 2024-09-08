<script setup lang="ts">
import CharacterAvatar from "@/components/CharacterAvatar.vue";
import CharacterPfp from "@/components/CharacterPfp.vue";
import { Simulation } from "@/lib/simulation";
import type { ImmersiveScenario } from "@/lib/simulation/scenario";
import { asyncComputed } from "@vueuse/core";
import { Grid2x2Icon, Grid2x2XIcon } from "lucide-vue-next";
import { computed, ref } from "vue";
import OnStageMark from "../OnStageMark.vue";

const { simulation, characterId, character } = defineProps<{
  simulation: Simulation;
  characterId: string;
  character: ImmersiveScenario["content"]["characters"][string];
}>();

const scenario = computed(
  () =>
    // Because DevConsole is only shown in immersive mode.
    simulation.scenario as ImmersiveScenario,
);

const onStageCharacter = computed(() =>
  simulation.state!.stage.value.characters.find((c) => c.id === characterId),
);

const isOnStage = computed(() => !!onStageCharacter.value);
const onStageOutfitId = computed(() => onStageCharacter.value?.outfitId);
const onStageExpressionId = computed(
  () => onStageCharacter.value?.expressionId,
);

const selectedOutfitId = ref<string>(
  onStageOutfitId.value || scenario.value.defaultOutfitId(characterId),
);
const selectedExpressionId = ref<string>(
  onStageExpressionId.value || scenario.value.defaultExpressionId(characterId),
);
const sceneBgUrl = asyncComputed(() =>
  scenario.value.resourceUrl(
    scenario.value.ensureScene(simulation.state!.stage.value.sceneId).bg,
  ),
);

const expressionPreviewTranform = computed(
  () =>
    scenario.value.ensureCharacter(characterId).layeredSpritesAvatar
      .expressionsPreviewTransform,
);

const outfitPreviewTranform = computed(
  () =>
    scenario.value.ensureCharacter(characterId).layeredSpritesAvatar
      .outfitsPreviewTransform,
);

function selectOutfitId(outfitId: string) {
  selectedOutfitId.value = outfitId;

  if (onStageCharacter.value) {
    simulation.state!.setOutfit(characterId, outfitId);
  }
}

function selectExpressionId(expressionId: string) {
  selectedExpressionId.value = expressionId;

  if (onStageCharacter.value) {
    simulation.state!.setExpression(characterId, expressionId);
  }
}

function addToStage() {
  simulation.state!.addCharacter(
    characterId,
    selectedOutfitId.value,
    selectedExpressionId.value,
  );
}

function removeFromStage() {
  simulation.state!.removeCharacter(characterId);
}
</script>

<template lang="pug">
.grid.grid-cols-2.divide-x.overflow-y-hidden
  //- Info.
  .flex.h-full.flex-col.items-center.gap-1.overflow-y-auto.p-3
    .relative
      //- Pfp.
      CharacterPfp.aspect-square.w-24.rounded-lg.border-2.border-white.object-cover.shadow-lg(
        :scenario="simulation.scenario"
        :character
      )
      OnStageMark.absolute.-bottom-1.-right-1.shadow-lg(v-if="isOnStage")

    //- Info.
    span.mt-2.font-semibold.leading-tight(:style="{ color: character.color }") {{ character.name }}
    p.text-center.text-sm.leading-tight {{ character.about }}

    //- Add/remove from stage button.
    button.btn.btn-md.btn-error.btn-pressable.mt-1.rounded(
      v-if="isOnStage"
      @click="removeFromStage"
      title="Remove from stage"
    )
      Grid2x2XIcon(:size="16" :stroke-width="3")
      | Remove
    button.btn.btn-md.btn-primary.btn-pressable.mt-1.rounded(
      v-else
      @click="addToStage"
      title="Add to stage"
    )
      Grid2x2Icon(:size="16" :stroke-width="3")
      | Add

    //- Outfits.
    h1.font-semibold.tracking-wide Outfits
    ul.grid.w-full.gap-2(class="max-lg:grid-cols-2 lg:grid-cols-3")
      CharacterAvatar.h-24.w-full.cursor-pointer.rounded-lg.border-2.shadow-lg.transition-transform.pressable-sm(
        v-for="outfitId of Object.keys(character.outfits)"
        :key="outfitId"
        :class="{ 'border-white': outfitId !== selectedOutfitId, 'border-primary-500': outfitId === selectedOutfitId }"
        :scenario
        :character-id
        :outfit-id
        :expression-id="selectedExpressionId"
        :translate-x="outfitPreviewTranform?.x"
        :translate-y="outfitPreviewTranform?.y"
        :scale="outfitPreviewTranform?.scale"
        :title="outfitId"
        @click="selectOutfitId(outfitId)"
      )

    //- Expressions.
    h1.font-semibold.tracking-wide Expressions
    ul.grid.w-full.gap-2(class="max-lg:grid-cols-2 lg:grid-cols-3")
      CharacterAvatar.h-24.w-full.cursor-pointer.rounded-lg.border-2.shadow-lg.transition-transform.pressable-sm(
        v-for="expressionId of (character.expressions)"
        :key="expressionId"
        :class="{ 'border-white': expressionId !== selectedExpressionId, 'border-primary-500': expressionId === selectedExpressionId }"
        :scenario
        :character-id
        :outfit-id="selectedOutfitId"
        :expression-id
        :translate-x="expressionPreviewTranform?.x"
        :translate-y="expressionPreviewTranform?.y"
        :scale="expressionPreviewTranform?.scale"
        :title="expressionId"
        @click="selectExpressionId(expressionId)"
      )

  //- Render.
  .relative.grid.h-full.w-full
    img.absolute.h-full.w-full.object-cover(:src="sceneBgUrl")
    CharacterAvatar.absolute.w-full(
      :scenario
      :character-id
      :outfit-id="selectedOutfitId"
      :expression-id="selectedExpressionId"
    )
</template>
