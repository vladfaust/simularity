<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { Simulation, State } from "@/lib/simulation";
import { compareStateDeltas } from "@/lib/simulation/state";
import { Update } from "@/lib/simulation/update";
import {
  AsteriskIcon,
  SaveIcon,
  ThumbsUpIcon,
  UndoIcon,
} from "lucide-vue-next";
import { computed, ref, triggerRef } from "vue";
import Command from "./DirectorUpdate/Command.vue";

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

function reset() {
  props.simulation.state!.setState(props.simulation.previousState.value!);

  if (directorUpdate.value?.code.length) {
    props.simulation.state!.apply(directorUpdate.value.code);
  }

  triggerRef(delta);
}

function removeCommand(index: number) {
  const localDelta = State.delta(
    props.simulation.state!.serialize(),
    props.simulation.previousState.value,
  );
  localDelta.splice(index, 1);

  props.simulation.state!.setState(props.simulation.previousState.value!);
  props.simulation.state!.apply(localDelta);

  triggerRef(delta);
}
</script>

<template lang="pug">
.flex.flex-col.gap-2
  RichTitle
    span.font-semibold.leading-snug.tracking-wide.text-white State delta
    AsteriskIcon.text-yellow-500.drop-shadow(
      v-if="modified"
      :size="18"
      title="Delta modified"
    )
    template(#extra)
      .flex.items-center.gap-1
        //- Reset button.
        button(v-if="modified" :disabled="saveInProgress" @click="reset")
          UndoIcon.text-white(:size="20")

        //- Save button.
        button(v-if="modified" :disabled="saveInProgress" @click="save")
          SaveIcon.text-white(:size="20")

        //- Positive preference button.
        button(
          v-if="!modified"
          @click="prefer"
          :disabled="preferenceInProgress"
          :class="directorUpdate?.preference ? 'text-success-700 fill-success-500' : 'text-white'"
        )
          ThumbsUpIcon.drop-shadow(:size="18")

  .flex.flex-col.gap-1.rounded-lg.bg-white.p-3
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
        :can-remove="true"
        @remove="removeCommand(i)"
      )
    span.italic(v-else) Empty
</template>
