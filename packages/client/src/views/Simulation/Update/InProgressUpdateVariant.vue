<script lang="ts" setup>
import CharacterPfp from "@/components/CharacterPfp.vue";
import { Mode, type Simulation } from "@/lib/simulation";
import {
  CHARACTER_LINE_PREDICTION_REGEX,
  NARRATOR,
} from "@/lib/simulation/agents/writer";
import type { Update } from "@/lib/simulation/update";
import { translationWithFallback } from "@/logic/i18n";
import { TransitionRoot } from "@headlessui/vue";
import { BotIcon, ThumbsDownIcon } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import DirectorUpdateText from "./DirectorUpdateText.vue";
import RichText from "./RichText.vue";

const props = defineProps<{
  variant?: NonNullable<Update["inProgressVariant"]["value"]>;
  isSingle: boolean;
  live: boolean;
  simulation: Simulation;
  translucent: boolean;
  phonyPreferenceButton: boolean;
}>();

const match = computed(() =>
  props.variant
    ? CHARACTER_LINE_PREDICTION_REGEX.exec(props.variant.writerUpdate.text)
    : undefined,
);

const bufferedCharacterId = ref<string | null>("");
const bufferedClock = ref<string | null>("");
const bufferedText = ref<string | null>("");

const extractedCharacterId = computed(() => match.value?.groups?.characterId);
watch(extractedCharacterId, (characterId) => {
  if (!characterId) return;
  bufferedCharacterId.value = characterId;
});

const extractedClock = computed(() => match.value?.groups?.clock);
watch(extractedClock, (clock) => {
  if (!clock) return;
  bufferedClock.value = clock;
});

const extractedText = computed(() => match.value?.groups?.text);
watch(extractedText, (text) => {
  if (!text) return;
  bufferedText.value = text;
});

const textContainer = ref<HTMLElement | null>(null);
watch(extractedText, () => {
  // Scroll to the bottom of the text.
  if (textContainer.value) {
    textContainer.value.scrollTop = textContainer.value.scrollHeight;
  }
});

watch(
  () => props.variant,
  (variant) => {
    if (variant === undefined) {
      // Scroll back to the top.
      if (textContainer.value) {
        textContainer.value.scrollTop = 0;
      }
    }
  },
);

const character = computed(() => {
  if (!props.simulation?.scenario) return undefined;
  if (!bufferedCharacterId.value) return undefined;

  if (bufferedCharacterId.value === NARRATOR) {
    return null;
  } else {
    return props.simulation.scenario.ensureCharacter(bufferedCharacterId.value);
  }
});
</script>

<template lang="pug">
.flex.flex-col
  //- Top row.
  .flex.items-center.justify-between.gap-3
    div
      TransitionRoot(
        :show="character !== undefined"
        :unmount="true"
        enter="duration-200 ease-out"
        enter-from="-translate-x-full opacity-0"
        enter-to="translate-x-0 opacity-100"
        leave="duration-200 ease-in"
        leave-from="translate-x-0 opacity-100"
        leave-to="-translate-x-full opacity-0"
      )
        .flex.items-center.gap-1
          template(v-if="character")
            CharacterPfp.aspect-square.h-5.rounded.border(
              :scenario="simulation.scenario"
              :character
            )
            span.font-semibold.leading-none(
              :style="{ color: character.color }"
            ) {{ translationWithFallback(character.name, simulation.locale) }}
          template(v-else)
            .grid.aspect-square.h-5.place-items-center.rounded.border(
              :class="{ 'opacity-0': character === undefined }"
            )
              BotIcon(:size="16")
            span.font-semibold.leading-none(
              :class="{ 'opacity-0': character === undefined }"
            ) Narrator

          //- span.leading-none {{ bufferedClock }}

    //- Buttons.
    .flex.items-center.gap-2
      //- ADHOC: To even the heights with the Update.
      ThumbsDownIcon.opacity-0(
        v-if="phonyPreferenceButton"
        :size="18"
        style="margin-top: 0.3rem"
      )

      slot(name="extra")
      slot(name="variant-navigation")

  //- Text.
  .overflow-y-scroll(
    ref="textContainer"
    :class="{ 'h-full overflow-y-scroll': isSingle }"
    class="mt-0.5"
  )
    p.leading-snug
      DirectorUpdateText.italic.opacity-50(
        v-if="simulation.mode === Mode.Immersive && variant?.directorUpdate"
        :simulation
        :commands="variant.directorUpdate"
      )
      RichText(
        v-if="live && bufferedText"
        :text="bufferedText"
        as="span"
        :class="{ 'opacity-50': translucent }"
      )
      span.-my-1.inline-block.h-5.w-2.animate-pulse.bg-black(
        style="animation-duration: 500ms"
      )
</template>
