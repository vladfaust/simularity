<script setup lang="ts">
import { d } from "@/lib/drizzle";
import { allSavesQueryKey, useSavesQuery, useScenariosQuery } from "@/queries";
import { routeLocation } from "@/router";
import { TransitionRoot } from "@headlessui/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { dialog } from "@tauri-apps/api";
import { useLocalStorage } from "@vueuse/core";
import { inArray } from "drizzle-orm";
import {
  Loader2Icon,
  PuzzleIcon,
  SquareMousePointerIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { toast } from "vue3-toastify";
import NsfwIcon from "@/components/NsfwIcon.vue";
import Save from "@/components/Saves/Save.vue";
import { env } from "@/env";

const props = defineProps<{
  scenarioId?: string;
}>();

const queryClient = useQueryClient();
const showExtra = useLocalStorage("showExtraSave", false);
const scenarioNameFilter = ref("");
const scenarioId = computed(() =>
  props.scenarioId ?? showExtra.value ? undefined : env.VITE_PRODUCT_ID,
);
const { data: saves } = useSavesQuery(
  scenarioId,
  showExtra,
  scenarioNameFilter,
);
const { data: scenarios } = useScenariosQuery();
const showNsfw = useLocalStorage("showNsfw", false);
const selectionMode = ref(false);
const selectedSaveIds = ref<number[]>([]);
const deletionInProgress = ref(false);

const filteredSaves = computed(() =>
  saves.value?.filter((s) => {
    const scenario = scenarios.value?.find((sc) => sc.id === s.scenarioId);
    if (!scenario) return false;

    return (
      (showNsfw.value || !scenario.content.nsfw) &&
      (!scenarioNameFilter.value ||
        scenario.content.name
          .toLowerCase()
          .includes(scenarioNameFilter.value.toLowerCase()))
    );
  }),
);

async function deleteSelected() {
  if (selectedSaveIds.value.length === 0) return;

  if (
    !(await dialog.confirm(
      `Are you sure you want to delete ${selectedSaveIds.value.length} saves?`,
      {
        title: "Delete saves",
        okLabel: `Delete ${selectedSaveIds.value.length} saves`,
        type: "warning",
      },
    ))
  ) {
    console.log("Cancelled delete");
    return;
  }

  console.log("Deleting saves", selectedSaveIds.value);
  deletionInProgress.value = true;

  try {
    await d.db
      .update(d.simulations)
      .set({ deletedAt: new Date() })
      .where(inArray(d.simulations.id, selectedSaveIds.value));

    queryClient.invalidateQueries({
      queryKey: allSavesQueryKey(),
    });

    toast.success(`Deleted ${selectedSaveIds.value.length} saves`);

    selectedSaveIds.value = [];
  } catch (error) {
    console.error("Failed to delete saves", error);
    toast.error("Failed to delete saves");
  } finally {
    deletionInProgress.value = false;
  }
}

async function switchSelection(simulationId: number) {
  if (selectedSaveIds.value.includes(simulationId)) {
    selectedSaveIds.value = selectedSaveIds.value.filter(
      (id) => id !== simulationId,
    );
  } else {
    selectedSaveIds.value = [...selectedSaveIds.value, simulationId];
  }
}
</script>

<template lang="pug">
.relative.flex.flex-col.overflow-y-hidden
  //- Header.
  .flex.w-full.items-center.justify-between.gap-2.bg-white.p-3
    .relative.flex.w-full.items-center
      input.w-full.rounded-lg.bg-neutral-100.px-2.py-1.text-sm.italic.shadow-inner(
        v-model="scenarioNameFilter"
        placeholder="Filter by scenario name..."
        :disabled="selectionMode"
        class="disabled:opacity-50"
      )
      button.btn-pressable.btn.absolute.right-1.leading-none(
        v-if="scenarioNameFilter"
        @click="scenarioNameFilter = ''"
        title="Clear search"
        v-tooltip="'Clear search'"
        :disabled="selectionMode"
      )
        XCircleIcon.fill-neutral-400.text-white(:size="16")

    //- Toggle selection mode.
    button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
      @click="selectionMode = !selectionMode; selectedSaveIds = []"
      title="Switch to selection mode"
      v-tooltip="'Switch to selection mode'"
    )
      SquareMousePointerIcon(
        :size="18"
        :class="{ 'text-primary-500': selectionMode }"
      )

    //- Toggle extra scenarios.
    button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
      @click="showExtra = !showExtra"
      title="Toggle extra scenarios"
      v-tooltip="'Toggle extra scenarios'"
      :disabled="selectionMode"
    )
      PuzzleIcon(:size="18" :class="{ 'text-primary-500': showExtra }")

    //- Toggle NSFW.
    button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
      @click="showNsfw = !showNsfw"
      title="Toggle NSFW"
      v-tooltip="'Toggle NSFW'"
      :disabled="selectionMode"
    )
      NsfwIcon(:size="18" :class="{ ' text-pink-500': showNsfw }")

  //- Saves.
  .h-full.w-full.overflow-y-auto.p-3.shadow-inner(class="@container")
    ul.grid.w-full.gap-2(
      class="@sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4"
      :class="{ 'h-full': !filteredSaves?.length }"
    )
      li.cursor-pointer(
        v-if="filteredSaves?.length"
        v-for="simulation of filteredSaves"
      )
        RouterLink(
          :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
          custom
          v-slot="{ navigate }"
        )
          .content.transition.pressable(
            @click.stop.preventDefault="selectionMode ? switchSelection(simulation.id) : navigate()"
          )
            Save.select-none.overflow-hidden.rounded-lg.bg-white.shadow-lg.transition(
              :simulation-id="simulation.id"
              :key="simulation.id"
              :class="{ 'opacity-50': selectionMode && !selectedSaveIds.includes(simulation.id) }"
              class="active:shadow-sm"
            )

      //- Empty state.
      .col-span-full.flex.w-full.flex-col.items-center.justify-center(v-else)
        p.text-gray-500 No saves found.

  //- Selection actions.
  TransitionRoot.absolute.bottom-0.z-10.flex.w-full.p-3(
    :show="selectedSaveIds.length > 0"
    enter="duration-100 ease-out"
    enter-from="translate-y-full opacity-0"
    enter-to="translate-y-0 opacity-100"
    leave="duration-100 ease-in"
    leave-from="translate-y-0 opacity-100"
    leave-to="translate-y-full opacity-0"
  )
    button.btn.btn-md.btn-error.btn-pressable-sm.w-full.rounded-lg.shadow-lg(
      @click="deleteSelected"
      :disabled="deletionInProgress"
    )
      Loader2Icon.animate-spin(v-if="deletionInProgress" :size="24")
      template(v-else)
        Trash2Icon(:size="20")
        | Delete selected ({{ selectedSaveIds.length }})
</template>
