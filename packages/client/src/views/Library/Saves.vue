<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { d } from "@/lib/drizzle";
import * as resources from "@/lib/resources";
import { routeLocation } from "@/router";
import { and, desc, eq, isNull } from "drizzle-orm";
import { EyeIcon, EyeOffIcon, HistoryIcon, Trash2Icon } from "lucide-vue-next";
import { onMounted, ref, shallowRef } from "vue";
import Save from "./Saves/Save.vue";

const props = defineProps<{
  expand: boolean;
  scenarioId?: string;

  // TODO: Allow filtering by scenario name.
  filterScenarioName?: string;
}>();

const emit = defineEmits<{
  (event: "clickExpand"): void;
}>();

const deletionMode = ref(false);
const saves = shallowRef<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);

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
      columns: { id: true },
      orderBy: desc(d.simulations.updatedAt),
      where: and(...conditions),
    })
    .then((value) => (saves.value = value));
});
</script>

<template lang="pug">
//- Recent plays (saves).
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
          @click.stop="emit('clickExpand'); deletionMode = !expand"
          v-tooltip="'Toggle visibility'"
        )
          EyeIcon(:size="18" v-if="expand")
          EyeOffIcon(:size="18" v-else)

  ul.grid.w-full.grid-cols-3.gap-2(class="@container" :class="{ hidden: !expand }")
    li.w-full.shrink-0(
      v-for="simulation of saves"
      :style="{ animation: deletionMode ? 'tilt-shaking 0.2s infinite' : 'none' }"
    )
      RouterLink(
        :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
        custom
        v-slot="{ href, navigate }"
      )
        .content(
          :href
          @click.stop.preventDefault="deletionMode ? deleteSave(simulation.id) : navigate()"
          :class="{ 'cursor-crosshair': deletionMode }"
        )
          Save.overflow-hidden.rounded-lg.bg-white.shadow-lg.transition-transform.pressable(
            :simulation-id="simulation.id"
            :key="simulation.id"
          )
</template>
