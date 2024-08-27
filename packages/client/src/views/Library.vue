<script setup lang="ts">
import { readScenarios, Scenario } from "@/lib/simulation/scenario";
import { routeLocation } from "@/router";
import { onMounted, shallowRef } from "vue";
import ScenarioVue from "./Library/Scenario.vue";
import Header from "@/components/Browser/Header.vue";
import { FolderIcon } from "lucide-vue-next";
import { computed } from "vue";
import { ref } from "vue";

const scenarios = shallowRef<Scenario[]>([]);
const search = ref("");

const filteredScenarios = computed(() =>
  scenarios.value.filter((scenario) =>
    scenario.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
);

function openScenarioDir() {
  console.log("openScenarioDir");
}

onMounted(async () => {
  scenarios.value = await readScenarios();
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
        @click="openScenarioDir"
        disabled
      )
        FolderIcon(:size="18")
        span Open folder

  .flex.h-full.w-full.flex-col.items-center.overflow-y-auto.shadow-inner
    ul.grid.w-full.w-full.max-w-4xl.gap-2.p-3(class="2xs:grid-cols-2 xs:grid-cols-3")
      li.cursor-pointer.overflow-hidden.rounded-lg.border.bg-white.shadow-lg.transition-transform.pressable(
        v-for="scenario in filteredScenarios"
        :key="scenario.id"
        :title="scenario.name"
        class="active:shadow-sm"
      )
        RouterLink(
          :to="routeLocation({ name: 'Scenario', params: { scenarioId: scenario.id } })"
        )
          ScenarioVue(:scenario)
        //- .flex.flex-col.p-2(v-else)
        //-   span.break-all.font-semibold.tracking-wide.text-error-500 Error at {{ scenario.basePath }}
        //-   code.max-h-48.overflow-scroll.text-xs {{ scenario.error }}
</template>
