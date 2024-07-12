<script setup lang="ts">
import { type Scenario } from "@/lib/simulation";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  TransitionChild,
  TransitionRoot,
} from "@headlessui/vue";
import { ChevronDownIcon, XIcon } from "lucide-vue-next";
import { computed, onUnmounted, ref } from "vue";
import CharacterImage from "@/components/CharacterImage.vue";
import LocationImage from "@/components/LocationImage.vue";
import { toSceneQualifiedId } from "@/lib/simulation/state";
import { State } from "@/lib/simulation";
import { watchImmediate, onClickOutside } from "@vueuse/core";
import { sleep } from "@/lib/utils";

const HIDE_MODAL_DURATION = 200;

const props = defineProps<{
  assetBaseUrl: URL;
  scenario: Scenario;
  state: State;
}>();

//#region Character
//

const characterDisclosureOpen = ref(true);
function onCharacterDisclosureButtonClick() {
  if (characterDisclosureOpen.value) {
    characterDisclosureOpen.value = false;
    return;
  }

  characterDisclosureOpen.value = true;

  if (locationDisclosureOpen.value) {
    locationDisclosureOpen.value = false;
  }
}

const selectedCharacterId = ref<string | undefined>();
const selectedCharacter = computed(() => {
  return props.scenario.characters.find(
    (c) => c.id === selectedCharacterId.value,
  );
});

const selectedCharacterRef = ref<HTMLElement | null>(null);
const showSelectedCharacter = ref(false);
async function hideSelectedCharacterDebounced() {
  if (!showSelectedCharacter.value) return;
  showSelectedCharacter.value = false;
  await sleep(HIDE_MODAL_DURATION);
  selectedCharacterId.value = undefined;
}
const unlistenSelectedCharacterOnClickOutside = onClickOutside(
  selectedCharacterRef,
  hideSelectedCharacterDebounced,
);

function isCharacterOnStage(characterId: string) {
  return props.state.stage.value.characters.find((c) => c.id === characterId);
}

function addCharacterToStage(characterId: string) {
  const outfitId =
    selectedCharacterOutfitIds.value[characterId] ||
    props.scenario.characters.find((c) => c.id === characterId)!.outfits[0].id;

  const expressionId =
    selectedCharacterExpressionIds.value[characterId] ||
    props.scenario.characters.find((c) => c.id === characterId)!.expressions[0]
      .id;

  props.state.addCharacter(characterId, outfitId, expressionId);
}

function removeCharacterFromStage(characterId: string) {
  props.state.removeCharacter(characterId);
}

const selectedCharacterOutfitIds = ref<Record<string, string>>({});
watchImmediate(
  () => props.state.stage.value.characters,
  (characters) => {
    selectedCharacterOutfitIds.value = {};

    for (const character of characters) {
      selectedCharacterOutfitIds.value[character.id] = character.outfitId;
    }
  },
);

const selectedCharacterExpressionIds = ref<Record<string, string>>({});
watchImmediate(
  () => props.state.stage.value.characters,
  (characters) => {
    selectedCharacterExpressionIds.value = {};

    for (const character of characters) {
      selectedCharacterExpressionIds.value[character.id] =
        character.expressionId;
    }
  },
);

function changeCharacterOutfit(characterId: string, outfitId: string) {
  selectedCharacterOutfitIds.value[characterId] = outfitId;

  if (isCharacterOnStage(characterId)) {
    props.state.setOutfit(characterId, outfitId);
  }
}

function changeCharacterExpression(characterId: string, expressionId: string) {
  selectedCharacterExpressionIds.value[characterId] = expressionId;

  if (isCharacterOnStage(characterId)) {
    props.state.setExpression(characterId, expressionId);
  }
}

//
//#endregion

//#region Location
//

const locationDisclosureOpen = ref(false);
function onLocationDisclosureButtonClick() {
  if (locationDisclosureOpen.value) {
    locationDisclosureOpen.value = false;
    return;
  }

  locationDisclosureOpen.value = true;

  if (characterDisclosureOpen.value) {
    characterDisclosureOpen.value = false;
  }
}

const selectedLocationId = ref<string | undefined>();
const selectedLocation = computed(() => {
  return props.scenario.locations.find(
    (c) => c.id === selectedLocationId.value,
  );
});

const selectedLocationRef = ref<HTMLElement | null>(null);
const showSelectedLocation = ref(false);
async function hideSelectedLocationDebounced() {
  if (!showSelectedLocation.value) return;
  showSelectedLocation.value = false;
  await sleep(HIDE_MODAL_DURATION);
  selectedLocationId.value = undefined;
}
const unlistenSelectedLocationOnClickOutside = onClickOutside(
  selectedLocationRef,
  hideSelectedLocationDebounced,
);

const selectedLocationSceneIds = ref<Record<string, string>>({});
watchImmediate(
  () => props.state.stage.value.scene,
  (scene) => {
    if (scene) {
      selectedLocationSceneIds.value[scene.locationId] = scene.sceneId;
    } else {
      selectedLocationSceneIds.value = {};
    }
  },
);

function isLocationSetAsScene(locationId: string) {
  return props.state.stage.value.scene?.locationId === locationId;
}

function setLocationAsScene(locationId: string) {
  const sceneId =
    selectedLocationSceneIds.value[locationId] ||
    props.scenario.locations.find((l) => l.id === locationId)!.scenes[0].id;

  props.state.setScene(toSceneQualifiedId(locationId, sceneId), false);
}

function changeLocationScene(locationId: string, sceneId: string) {
  selectedLocationSceneIds.value[locationId] = sceneId;

  if (isLocationSetAsScene(locationId)) {
    props.state.setScene(toSceneQualifiedId(locationId, sceneId), false);
  }
}

//
//#endregion

onUnmounted(() => {
  unlistenSelectedCharacterOnClickOutside();
  unlistenSelectedLocationOnClickOutside();
});
</script>

<template lang="pug">
.flex.flex-col.border-l.bg-gray-100.shadow-inner
  .flex.flex-col.border-b.p-2
    h1 Sandbox Console

  //- Characters.
  Disclosure(:default-open="true")
    DisclosureButton.border-b.bg-white(
      @click="onCharacterDisclosureButtonClick"
    )
      .flex.justify-between.p-2.transition-transform.pressable-sm
        h2.font-semibold.tracking-wide Characters
        ChevronDownIcon.transition-transform(
          :class="characterDisclosureOpen && 'rotate-180 transform '"
          :size="24"
        )

    DisclosurePanel.relative.flex.h-full.w-full.flex-col.overflow-hidden.border-b(
      static
      v-if="characterDisclosureOpen"
    )
      //- List of characters.
      .h-full.w-full.overflow-y-scroll.p-2
        .grid.w-full.grid-cols-3.gap-2
          template(
            v-for="character in scenario.characters"
            :key="character.id"
          )
            .aspect-square.cursor-pointer.overflow-hidden.rounded-lg.border.border-2.shadow.transition-transform.pressable(
              @click="selectedCharacterId = character.id; showSelectedCharacter = true"
              :class="isCharacterOnStage(character.id) ? 'border-green-500' : showSelectedCharacter && selectedCharacterId === character.id ? 'border-blue-500' : 'border-white'"
            )
              CharacterImage.h-full.w-full.bg-white(
                :asset-base-url="assetBaseUrl"
                :character="character"
                :outfit-id="selectedCharacterOutfitIds[character.id]"
                :expression-id="selectedCharacterExpressionIds[character.id]"
              )

      //- Selected character modal.
      TransitionRoot.absolute.bottom-0.flex.h-full.flex-col.justify-end.p-2(
        :show="showSelectedCharacter"
        :unmount="true"
        class="bg-black/30"
        enter="transition-opacity duration-200 ease-in"
        enter-from="opacity-0"
        enter-to="opacity-100"
        :leave="`transition-opacity duration-${HIDE_MODAL_DURATION} ease-out`"
        leave-from="opacity-100"
        leave-to="opacity-0"
      )
        TransitionChild.relative.w-full.shrink-0.rounded-xl.bg-white.shadow-lg(
          class="max-h-[80%]"
          :show="showSelectedCharacter"
          :unmount="true"
          ref="selectedCharacterRef"
          enter="transition duration-200 ease-in"
          enter-from="opacity-0 translate-y-full"
          enter-to="opacity-100 translate-y-0"
          :leave="`transition duration-${HIDE_MODAL_DURATION} ease-out`"
          leave-from="opacity-100 translate-y-0"
          leave-to="opacity-0 translate-y-full"
        )
          //- Close button.
          button.absolute.-right-1.-top-1.z-10.cursor-pointer.rounded-full.bg-white.p-2.shadow.transition-transform.pressable(
            @click="hideSelectedCharacterDebounced"
          )
            XIcon(:size="20" :stroke-width="2")

          //- Modal contents.
          .flex.h-full.flex-col.divide-y.overflow-y-auto(
            v-if="selectedCharacter"
          )
            //- Main section.
            .grid.w-full.grid-cols-3.gap-3.p-3
              //- Main character image.
              CharacterImage.aspect-square.h-full.w-full.rounded-lg.border(
                :asset-base-url="assetBaseUrl"
                :character="selectedCharacter"
                :outfit-id="selectedCharacterOutfitIds[selectedCharacter.id]"
                :expression-id="selectedCharacterExpressionIds[selectedCharacter.id]"
              )

              .col-span-2.flex.w-full.shrink-0.flex-col.gap-2
                .flex.flex-col.gap-1
                  span.items-center.text-lg.font-bold.leading-tight.tracking-wide(
                    :style="{ color: selectedCharacter.displayColor }"
                  ) {{ selectedCharacter.displayName || selectedCharacter.fullName }}
                  p.leading-tight {{ selectedCharacter.about }}
                button.btn.w-max.rounded.px-3.py-3.font-medium.leading-none.shadow.transition-transform.pressable(
                  :class="isCharacterOnStage(selectedCharacter.id) ? 'btn-error' : 'btn-primary'"
                  @click="isCharacterOnStage(selectedCharacter.id) ? removeCharacterFromStage(selectedCharacter.id) : addCharacterToStage(selectedCharacter.id)"
                )
                  | {{ isCharacterOnStage(selectedCharacter.id) ? "Remove from scene" : "Add to scene" }}

            //- Subsection.
            .flex.shrink-0.flex-col.gap-2.p-3
              //- Outfits.
              .flex.flex-col.gap-2
                span.font-semibold.tracking-wide Outfit
                .flex.w-full.gap-2.overflow-x-auto
                  button.aspect-square.h-full.shrink-0.overflow-hidden.rounded-lg.border.border-2.shadow.transition-transform.pressable(
                    v-for="outfit,i of selectedCharacter.outfits"
                    class="w-1/3"
                    :class="{ 'border-blue-500': selectedCharacterOutfitIds[selectedCharacter.id] ? selectedCharacterOutfitIds[selectedCharacter.id] === outfit.id : i === 0 }"
                    @click="changeCharacterOutfit(selectedCharacter.id, outfit.id)"
                  )
                    CharacterImage(
                      class="h-[110%]"
                      :asset-base-url="assetBaseUrl"
                      :character="selectedCharacter"
                      :outfit-id="outfit.id"
                      :expression-id="selectedCharacterExpressionIds[selectedCharacter.id]"
                    )

              //- Expressions.
              .flex.flex-col.gap-2
                span.font-semibold.tracking-wide Expression
                .flex.w-full.gap-2.overflow-x-auto
                  button.aspect-square.h-full.shrink-0.overflow-hidden.rounded.border.border-2.shadow.transition-transform.pressable(
                    v-for="expression, i of selectedCharacter.expressions"
                    class="w-1/4"
                    :class="{ 'border-blue-500': selectedCharacterExpressionIds[selectedCharacter.id] ? selectedCharacterExpressionIds[selectedCharacter.id] === expression.id : i === 0 }"
                    @click="changeCharacterExpression(selectedCharacter.id, expression.id)"
                  )
                    CharacterImage(
                      class="h-[250%] translate-y-[-10%]"
                      :asset-base-url="assetBaseUrl"
                      :character="selectedCharacter"
                      :outfit-id="selectedCharacterOutfitIds[selectedCharacter.id]"
                      :expression-id="expression.id"
                    )

  //- Locations.
  Disclosure(:default-open="false")
    DisclosureButton.border-b.bg-white(
      @click="onLocationDisclosureButtonClick"
    )
      .flex.justify-between.p-2.transition-transform.pressable-sm
        h2.font-semibold.tracking-wide Locations
        ChevronDownIcon.transition-transform(
          :class="locationDisclosureOpen && 'rotate-180 transform'"
          :size="24"
        )

    DisclosurePanel.relative.flex.h-full.w-full.flex-col.overflow-hidden.border-b(
      static
      v-if="locationDisclosureOpen"
    )
      .h-full.w-full.overflow-y-scroll.p-2
        .grid.w-full.grid-cols-2.gap-2
          template(v-for="location in scenario.locations" :key="location.id")
            .aspect-video.cursor-pointer.overflow-hidden.rounded-lg.border.border-2.shadow.transition-transform.pressable-sm(
              @click="selectedLocationId = location.id; showSelectedLocation = true"
              :class="isLocationSetAsScene(location.id) ? 'border-green-500' : showSelectedLocation && selectedLocationId === location.id ? 'border-blue-500' : 'border-white'"
            )
              LocationImage.h-full.w-full.bg-white(
                :asset-base-url="assetBaseUrl"
                :location="location"
                :scene-id="selectedLocationSceneIds[location.id]"
              )

      //- Selected location modal.
      TransitionRoot.absolute.bottom-0.flex.h-full.w-full.flex-col.justify-end.p-2(
        :show="showSelectedLocation"
        :unmount="true"
        class="bg-black/30"
        enter="transition-opacity duration-200 ease-in"
        enter-from="opacity-0"
        enter-to="opacity-100"
        :leave="`transition-opacity duration-${HIDE_MODAL_DURATION} ease-out`"
        leave-from="opacity-100"
        leave-to="opacity-0"
      )
        TransitionChild.relative.w-full.shrink-0.rounded-xl.bg-white.shadow-lg(
          class="max-h-[80%]"
          :show="showSelectedLocation"
          :unmount="true"
          ref="selectedLocationRef"
          enter="transition duration-200 ease-in"
          enter-from="opacity-0 translate-y-full"
          enter-to="opacity-100 translate-y-0"
          :leave="`transition duration-${HIDE_MODAL_DURATION} ease-out`"
          leave-from="opacity-100 translate-y-0"
          leave-to="opacity-0 translate-y-full"
        )
          //- Close button.
          button.absolute.-right-1.-top-1.z-10.cursor-pointer.rounded-full.bg-white.p-2.shadow.transition-transform.pressable(
            @click="hideSelectedLocationDebounced"
          )
            XIcon(:size="20" :stroke-width="2")

          .flex.h-full.w-full.shrink-0.flex-col.divide-y.overflow-y-auto.rounded-xl.border.bg-white.shadow-lg(
            v-if="selectedLocation"
          )
            .flex.w-full.flex-col.gap-2.p-3
              //- Main location image.
              LocationImage.aspect-video.w-full.overflow-hidden.rounded-lg.border.border(
                :asset-base-url="assetBaseUrl"
                :location="selectedLocation"
                :scene-id="selectedLocationSceneIds[selectedLocation.id]"
              )

              .flex.w-full.shrink-0.flex-col.items-center.p-2(class="gap-0.5")
                span.items-center.text-center.text-lg.font-bold.leading-tight.tracking-wide {{ selectedLocation.name }}
                p.text-center.leading-tight {{ selectedLocation.about }}
                button.btn.w-max.rounded.px-3.py-3.font-medium.leading-none.transition-transform.pressable(
                  class="mt-1.5"
                  :disabled="isLocationSetAsScene(selectedLocation.id)"
                  :class="isLocationSetAsScene(selectedLocation.id) ? '' : 'btn-primary'"
                  @click="setLocationAsScene(selectedLocation.id)"
                )
                  | {{ isLocationSetAsScene(selectedLocation.id) ? "Already set" : "Set as scene" }}

            .flex.shrink-0.flex-col.gap-2.p-3
              .flex.flex-col.gap-2
                span.font-semibold.tracking-wide Scenes
                .flex.w-full.gap-2.overflow-x-auto
                  button.aspect-video.h-full.shrink-0.overflow-hidden.rounded-lg.border.border-2.shadow.transition-transform.pressable-sm(
                    v-for="scene, i of selectedLocation.scenes"
                    class="w-1/2"
                    :class="{ 'border-blue-500': selectedLocationSceneIds[selectedLocation.id] ? selectedLocationSceneIds[selectedLocation.id] === scene.id : i === 0 }"
                    @click="changeLocationScene(selectedLocation.id, scene.id)"
                  )
                    LocationImage.h-full.w-full(
                      :asset-base-url="assetBaseUrl"
                      :location="selectedLocation"
                      :scene-id="scene.id"
                    )
</template>
