<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import * as resources from "@/lib/resources";
import { readScenarios, type Scenario } from "@/lib/simulation/scenario";
import * as tauri from "@/lib/tauri";
import { routeLocation } from "@/router";
import { BaseDirectory } from "@tauri-apps/api/fs";
import { useLocalStorage } from "@vueuse/core";
import {
  FolderOpenIcon,
  LayoutGridIcon,
  LayoutListIcon,
  ScrollTextIcon,
} from "lucide-vue-next";
import { computed, onMounted, ref, shallowRef, triggerRef } from "vue";
import Saves from "./Library/Saves.vue";
import ScenarioVue from "./Library/Scenario.vue";

const scenarios = shallowRef<Scenario[]>([]);
const search = ref("");

const filteredScenarios = computed(() =>
  scenarios.value.filter((scenario) =>
    scenario.content.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const layoutGrid = useLocalStorage("layoutGrid", true);
const showSaves = useLocalStorage<boolean>("showLibrarySaves", true);

async function openScenariosDir() {
  await tauri.utils.fileManagerOpen(await resources.scenariosDir());
}

onMounted(async () => {
  scenarios.value.push(...(await readScenarios(BaseDirectory.Resource)));
  scenarios.value.push(...(await readScenarios(BaseDirectory.AppLocalData)));
  triggerRef(scenarios);
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.bg-neutral-100
  .flex.w-full.justify-center.bg-white
    Header.h-full.w-full.max-w-4xl

  .flex.w-full.justify-center.border-t.bg-white
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2.p-3
      input.w-full.rounded-lg.bg-neutral-100.px-2.py-1.shadow-inner(
        v-model="search"
        placeholder="Search..."
      )
      button.btn.btn-sm.shrink-0.rounded-lg.border.transition-transform.pressable(
        @click="openScenariosDir"
        title="Open scenarios directory"
      )
        FolderOpenIcon(:size="18")
        span Open folder

  .flex.h-full.w-full.flex-col.items-center.gap-3.overflow-y-auto.py-3.shadow-inner
    //- Scenarios.
    .flex.w-full.max-w-4xl.flex-col.gap-2.px-3
      CustomTitle.w-full(title="Scenarios")
        template(#icon)
          ScrollTextIcon(:size="18")
        template(#extra)
          button.btn.btn-pressable(
            @click="layoutGrid = !layoutGrid"
            v-tooltip="layoutGrid ? 'Switch to list layout' : 'Switch to grid layout'"
          )
            LayoutGridIcon(v-if="layoutGrid" :size="18")
            LayoutListIcon(v-else :size="18")

      ul.w-full.w-full.max-w-4xl.gap-2(
        :class="{ 'grid 2xs:grid-cols-2 xs:grid-cols-3': layoutGrid, 'grid grid-cols-2': !layoutGrid }"
      )
        li.cursor-pointer.overflow-hidden.rounded-lg.border.bg-white.shadow-lg.transition-transform.pressable-sm(
          v-for="scenario in filteredScenarios"
          :key="scenario.id"
          class="active:shadow-sm"
        )
          RouterLink(
            :to="routeLocation({ name: 'Scenario', params: { scenarioId: scenario.id } })"
          )
            ScenarioVue(
              :key="scenario.id"
              :scenario
              :layout="layoutGrid ? 'grid' : 'list'"
            )

    //- Saves.
    Saves.w-full.max-w-4xl.gap-2.px-3(
      :class="{ hidden: search }"
      :expand="showSaves"
      @click-expand="showSaves = !showSaves"
    )
</template>
