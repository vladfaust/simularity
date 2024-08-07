<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { computed } from "vue";
import Command from "./DirectorUpdate/Command.vue";
import { AsteriskIcon, SaveIcon, ThumbsUpIcon } from "lucide-vue-next";
import { compareStateDeltas } from "@/lib/simulation/state";
import { Update } from "@/lib/simulation/update";
import { ref } from "vue";

const props = defineProps<{
  simulation: Simulation;
  update: Update;
}>();

const directorUpdate = computed(
  () => props.update.ensureChosenVariant.directorUpdate,
);

const delta = computed(() => {
  return props.simulation.previousStateDelta.value ?? [];
});

const modified = computed<boolean | null>(() => {
  return !compareStateDeltas(
    props.simulation.previousState.value ?? null,
    directorUpdate.value?.code ?? [],
    delta.value,
  );
});

const saveInProgress = ref(false);
async function save() {
  saveInProgress.value = true;

  try {
    await props.simulation.overwriteDirectorUpdate(props.update, delta.value);
  } finally {
    saveInProgress.value = false;
  }
}

const preferenceInProgress = ref(false);
async function prefer() {
  preferenceInProgress.value = true;

  try {
    if (directorUpdate.value?.preference) {
      console.log("Preference already set, resetting to null");
      await props.simulation.preferDirectorUpdate(props.update, null);
    } else {
      console.log("Setting preference to true");
      await props.simulation.preferDirectorUpdate(props.update, true);
    }
  } finally {
    preferenceInProgress.value = false;
  }
}
</script>

<template lang="pug">
.flex.flex-col.gap-2
  .flex.justify-between
    h1.flex.items-center.font-medium.leading-tight.tracking-wide.text-white
      | State delta
      AsteriskIcon.text-yellow-500.drop-shadow(
        v-if="modified"
        :size="18"
        title="Delta modified"
      )

    .flex.items-center.gap-1
      //- Save button.
      button(v-if="modified" :disabled="saveInProgress" @click="save")
        SaveIcon.text-white(:size="20")

      //- Positive preference button.
      button
        ThumbsUpIcon.drop-shadow(
          :size="18"
          :class="modified || directorUpdate?.preference ? 'text-success-700 fill-success-500' : 'text-white'"
          :disabled="preferenceInProgress"
          @click="prefer"
        )

  .flex.flex-col.gap-1.rounded-lg.bg-white.p-2
    h2.font-medium Director update code
    .flex.flex-col.gap-1(v-if="directorUpdate?.code.length")
      Command.shadow(
        v-for="command, i of directorUpdate.code"
        :key="i + command.name + command.args"
        :command
      )
    span.italic(v-else) Empty

    h2.font-medium Actual delta ({{ modified ? "modified" : "same" }})
    .flex.flex-col.gap-1(v-if="delta?.length")
      Command.shadow(
        v-for="command, i of delta"
        :key="i + command.name + command.args"
        :command
      )
    span.italic(v-else) Empty
</template>
