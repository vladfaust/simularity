<script setup lang="ts">
import {
  readScenarios,
  Scenario,
  type ErroredScenario,
} from "@/lib/simulation/scenario";
import { onMounted } from "vue";
import ScenarioVue from "./ChooseScenario/Scenario.vue";
import { shallowRef } from "vue";
import { routeLocation } from "@/lib/router";
import { ArrowLeft } from "lucide-vue-next";

const scenarios = shallowRef<(Scenario | ErroredScenario)[]>([]);

onMounted(async () => {
  scenarios.value = await readScenarios();
});
</script>

<template lang="pug">
.flex.flex-col
  .flex.justify-between.border-b.p-3
    RouterLink.btn.btn-md.rounded-lg.border.transition-transform.pressable(
      :to="routeLocation({ name: 'MainMenu' })"
    )
      ArrowLeft(:size="20")
      span Back

  ul.grid.p-3(class="2xs:grid-cols-2 xs:grid-cols-3")
    li.cursor-pointer.overflow-hidden.rounded-lg.border.transition-transform.pressable(
      v-for="scenario in scenarios"
      :key="scenario.id"
      :scenario
    )
      RouterLink(
        v-if="scenario instanceof Scenario && true"
        :to="routeLocation({ name: 'NewGame', params: { scenarioId: scenario.id } })"
      )
        ScenarioVue(:scenario)
      p(v-else) {{ scenario }}
</template>

<style lang="scss" scoped></style>
