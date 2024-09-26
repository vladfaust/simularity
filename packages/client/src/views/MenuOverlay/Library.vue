<script setup lang="ts">
import NsfwIcon from "@/components/NsfwIcon.vue";
import * as resources from "@/lib/resources";
import * as tauri from "@/lib/tauri";
import { useScenariosQuery } from "@/queries";
import { useLocalStorage } from "@vueuse/core";
import { FolderOpenIcon } from "lucide-vue-next";
import { computed, ref } from "vue";
import ScenarioVue from "./Library/Scenario.vue";

defineEmits<{
  (event: "select", scenarioId: string): void;
}>();

const scenariosQuery = useScenariosQuery();
const scenarioNameFilter = ref("");
const showNsfw = useLocalStorage("showNsfw", false);

const filteredScenarios = computed(() =>
  scenariosQuery.data.value?.filter(
    (scenario) =>
      scenario.content.name
        .toLowerCase()
        .includes(scenarioNameFilter.value.toLowerCase()) &&
      (showNsfw.value || !scenario.content.nsfw),
  ),
);

async function openScenariosDir() {
  await tauri.utils.fileManagerOpen(await resources.scenariosDir());
}
</script>

<template lang="pug">
.flex.flex-col
  //- Header.
  .flex.w-full.justify-center.bg-white
    .flex.w-full.items-center.justify-between.gap-2.p-3
      input.w-full.rounded-lg.bg-neutral-100.px-2.py-1.text-sm.italic.shadow-inner(
        v-model="scenarioNameFilter"
        placeholder="Filter scenarios by name..."
      )
      button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
        @click="openScenariosDir"
        title="Open scenarios directory"
        v-tooltip="'Open scenarios directory'"
      )
        FolderOpenIcon(:size="18")
      button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
        @click="showNsfw = !showNsfw"
        title="Toggle NSFW"
        v-tooltip="'Toggle NSFW'"
      )
        NsfwIcon(:size="18" :class="{ 'text-pink-500': showNsfw }")

  //- List of scenarios.
  .h-full.w-full.overflow-y-auto.p-3.shadow-inner(class="@container")
    ul.grid.w-full.gap-2(class="@lg:grid-cols-3 @4xl:grid-cols-4")
      li.cursor-pointer.overflow-hidden.rounded-lg.border-4.border-white.shadow-lg.transition.pressable-sm(
        v-for="scenario in filteredScenarios"
        :key="scenario.id"
        class="active:shadow-sm"
      )
        ScenarioVue(
          :key="scenario.id"
          :scenario
          :always-hide-details="true"
          layout="grid"
          @click="$emit('select', scenario.id)"
        )
</template>
