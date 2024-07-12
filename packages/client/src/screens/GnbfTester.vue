<script setup lang="ts">
import { buildGnbf } from "@/lib/simulation/agents/director";
import { computed, ref } from "vue";

const scenario = ref<Parameters<typeof buildGnbf>[0]>({
  locations: [
    {
      id: "loc1",
      scenes: [
        {
          id: "scene1",
        },
        {
          id: "scene2",
        },
      ],
    },
    {
      id: "loc2",
      scenes: [
        {
          id: "scene3",
        },
      ],
    },
  ],
  characters: [
    {
      id: "ch1",
      outfits: [{ id: "outfit1" }],
      expressions: [{ id: "expr1" }, { id: "expr2" }],
    },
    {
      id: "ch2",
      outfits: [{ id: "outfit2" }, { id: "outfit3" }],
      expressions: [{ id: "expr3" }],
    },
  ],
});

const scenarioJson = computed({
  get: () => JSON.stringify(scenario.value, null, 2),
  set: (value: string) => {
    try {
      scenario.value = JSON.parse(value);
    } catch (e) {
      console.error(e);
    }
  },
});

const gnbf = computed(() => buildGnbf(scenario.value));
</script>

<template lang="pug">
.flex.flex-col
  textarea.font-mono(v-model="scenarioJson")
  pre {{ gnbf }}
</template>
