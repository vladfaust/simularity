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

  ul.grid.gap-2.p-3(class="2xs:grid-cols-2 xs:grid-cols-3")
    li.overflow-hidden.rounded-lg.border(
      v-for="scenario in scenarios"
      :key="scenario.id"
      :scenario
      :class="{ 'cursor-pointer transition-transform pressable': scenario instanceof Scenario }"
    )
      RouterLink(
        v-if="scenario instanceof Scenario && true"
        :to="routeLocation({ name: 'NewGame', params: { scenarioId: scenario.id } })"
      )
        ScenarioVue(:scenario)
      .flex.flex-col.p-2(v-else)
        span.break-all.font-semibold.tracking-wide.text-error-500 Error at {{ scenario.basePath }}
        code.max-h-48.overflow-scroll.text-xs {{ scenario.error }}
</template>

<style lang="scss" scoped></style>
