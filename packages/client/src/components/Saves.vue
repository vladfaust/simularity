<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { d } from "@/lib/drizzle";
import * as resources from "@/lib/resources";
import { ensureScenario, type Scenario } from "@/lib/simulation/scenario";
import { routeLocation } from "@/router";
import { asyncComputed } from "@vueuse/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import { EyeIcon, EyeOffIcon, HistoryIcon, Trash2Icon } from "lucide-vue-next";
import { computed, onMounted, ref, shallowRef } from "vue";
import Save from "./Saves/Save.vue";

const props = defineProps<{
  expand: boolean;
  scenarioId?: string;
  hideNsfw?: boolean;
  hideExpandButton?: boolean;
  filterScenarioName?: string;
}>();

const emit = defineEmits<{
  (event: "clickExpand"): void;
}>();

const deletionMode = ref(false);
const saves = shallowRef<
  Pick<typeof d.simulations.$inferSelect, "id" | "scenarioId">[]
>([]);
const scenarioMap = asyncComputed<Map<string, Scenario> | undefined>(
  async () => {
    if (!saves.value.length) return undefined;
    const scenarios = await Promise.all(
      saves.value.map((save) => ensureScenario(save.scenarioId)),
    );
    return new Map(scenarios.map((s) => [s.id, s]));
  },
);
const filteredSaves = computed(() =>
  saves.value.filter((s) => {
    const scenario = scenarioMap.value?.get(s.scenarioId);
    if (!scenario) return false;

    return (
      (!props.hideNsfw || !scenario.content.nsfw) &&
      (!props.filterScenarioName ||
        scenario.content.name
          .toLowerCase()
          .includes(props.filterScenarioName.toLowerCase()))
    );
  }),
);

async function deleteSave(simulationId: number) {
  if (
    !(await resources.confirm_("Are you sure you want to delete this save?", {
      title: "Delete save",
      okLabel: "Delete",
      type: "info",
    }))
  ) {
    console.log("Cancelled delete save", simulationId);
    return;
  }

  console.log("Deleting save", simulationId);
  await d.db
    .update(d.simulations)
    .set({ deletedAt: new Date() })
    .where(eq(d.simulations.id, simulationId));

  saves.value = saves.value.filter((s) => s.id !== simulationId);
}

onMounted(async () => {
  const conditions = [isNull(d.simulations.deletedAt)];

  if (props.scenarioId) {
    conditions.push(eq(d.simulations.scenarioId, props.scenarioId));
  }

  d.db.query.simulations
    .findMany({
      columns: { id: true, scenarioId: true },
      orderBy: desc(d.simulations.updatedAt),
      where: and(...conditions),
    })
    .then((value) => (saves.value = value));
});
</script>

<template lang="pug">
.flex.flex-col
  CustomTitle.cursor-pointer(title="Recent plays" @click="emit('clickExpand')")
    template(#icon)
      HistoryIcon(:size="18")
    template(#extra)
      .flex.items-center.gap-1
        button.btn.transition.pressable(
          v-if="expand"
          @click.stop="deletionMode = !deletionMode"
          :class="{ 'text-red-500': deletionMode }"
          v-tooltip="'Toggle delete mode'"
        )
          Trash2Icon(:size="18")
        button.btn.btn-pressable(
          v-if="!hideExpandButton"
          @click.stop="emit('clickExpand'); deletionMode = !expand"
          v-tooltip="'Toggle visibility'"
        )
          EyeIcon(:size="18" v-if="expand")
          EyeOffIcon(:size="18" v-else)

  ul.grid.w-full.grid-cols-3.gap-2(class="@container" :class="{ hidden: !expand }")
    li.cursor-pointer(v-for="simulation of filteredSaves")
      RouterLink(
        :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
        custom
        v-slot="{ navigate }"
      )
        .content(
          @click.stop.preventDefault="deletionMode ? deleteSave(simulation.id) : navigate()"
          :class="{ 'cursor-crosshair': deletionMode }"
        )
          Save.overflow-hidden.rounded-lg.bg-white.shadow-lg.transition-transform.pressable(
            :simulation-id="simulation.id"
            :key="simulation.id"
            :style="{ animation: deletionMode ? 'tilt-shaking 0.2s infinite' : 'none' }"
          )
</template>
