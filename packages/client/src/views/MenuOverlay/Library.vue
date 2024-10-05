<script setup lang="ts">
import NsfwIcon from "@/components/NsfwIcon.vue";
import ScenarioCardById from "@/components/ScenarioCardById.vue";
import { trackPageview } from "@/lib/plausible";
import * as resources from "@/lib/resources";
import * as tauri from "@/lib/tauri";
import { useLocalScenariosQuery, useRemoteScenariosQuery } from "@/queries";
import { useLocalStorage } from "@vueuse/core";
import {
  CheckIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  LayoutListIcon,
  LibraryBigIcon,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

defineEmits<{
  (event: "select", scenarioId: string): void;
}>();

const scenarioNameFilter = ref("");
const showNsfw = useLocalStorage("library:showNsfw", false);

const localScenariosQuery = useLocalScenariosQuery();
const remoteScenariosQuery = useRemoteScenariosQuery(
  showNsfw,
  scenarioNameFilter,
);

const layoutGrid = useLocalStorage("library:layoutGrid", true);
const hideRemote = useLocalStorage("library:hideRemote", false);

const filteredLocalScenarios = computed(() =>
  localScenariosQuery.data.value?.filter(
    (scenario) =>
      scenario.content.name
        .toLowerCase()
        .includes(scenarioNameFilter.value.toLowerCase()) &&
      (showNsfw.value || !scenario.content.nsfw),
  ),
);

const mergedScenarioIds = computed(
  () =>
    new Set([
      ...(filteredLocalScenarios.value?.map((scenario) => scenario.id) ?? []),
      ...(!hideRemote.value ? remoteScenariosQuery.data.value ?? [] : []),
    ]),
);

async function openScenariosDir() {
  await tauri.utils.fileManagerOpen(await resources.scenariosDir());
}

onMounted(() => {
  trackPageview("/library");
});
</script>

<template lang="pug">
.flex.flex-col
  //- Header.
  .flex.w-full.justify-center.border-b
    .flex.w-full.items-center.justify-between.gap-2.p-3
      .flex.shrink-0.items-center.gap-1
        LibraryBigIcon(:size="20")
        span.font-semibold.leading-snug.tracking-wide Library

      input.w-full.rounded.rounded-lg.border.bg-white.px-2.text-sm(
        style="padding-top: calc(0.25rem - 1px); padding-bottom: calc(0.25rem - 1px)"
        v-model="scenarioNameFilter"
        placeholder="Filter by name..."
      )

      .flex.items-center(class="gap-1.5")
        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          @click="openScenariosDir"
          title="Open scenarios directory"
          v-tooltip="'Open scenarios directory'"
        )
          FolderOpenIcon(:size="18")

        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          @click="layoutGrid = !layoutGrid"
          title="Toggle layout"
          v-tooltip="'Toggle layout'"
        )
          LayoutGridIcon(:size="18" v-if="layoutGrid")
          LayoutListIcon(:size="18" v-else)

        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          @click="hideRemote = !hideRemote"
          title="Toggle in-library-only"
          v-tooltip="'Toggle in-library-only'"
          :class="{ 'bg-white': hideRemote }"
          class="hover:bg-white"
        )
          CheckIcon(:size="18" :class="{ 'text-success-500': hideRemote }")

        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          @click="showNsfw = !showNsfw"
          title="Toggle NSFW"
          v-tooltip="'Toggle NSFW'"
          :class="{ 'bg-white': showNsfw }"
          class="hover:bg-white"
        )
          NsfwIcon(:size="18" :class="{ 'text-pink-500': showNsfw }")

  //- List of scenarios.
  .h-full.w-full.overflow-y-auto.p-3(class="@container")
    ul.grid.w-full.gap-2(
      :class="{ '@lg:grid-cols-3 @4xl:grid-cols-4': layoutGrid, '@xl:grid-cols-2': !layoutGrid }"
    )
      li.cursor-pointer.overflow-hidden.rounded-lg.border-4.border-white.shadow-lg.transition.pressable-sm(
        v-for="scenarioId in mergedScenarioIds"
        :key="scenarioId"
        class="active:shadow-sm"
      )
        ScenarioCardById(
          :key="scenarioId"
          :scenario-id
          :always-hide-details="true"
          :layout="layoutGrid ? 'grid' : 'list'"
          @click="$emit('select', scenarioId)"
        )
</template>
