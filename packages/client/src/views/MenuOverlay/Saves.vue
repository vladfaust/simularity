<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
import { d } from "@/lib/drizzle";
import { trackPageview } from "@/lib/plausible";
import { allSavesQueryKey, useSavesQuery } from "@/queries";
import { routeLocation } from "@/router";
import { TransitionRoot } from "@headlessui/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { dialog } from "@tauri-apps/api";
import { inArray } from "drizzle-orm";
import {
  CircleSlash2Icon,
  HistoryIcon,
  Loader2Icon,
  SquareMousePointerIcon,
  Trash2Icon,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue3-toastify";
import Save from "./Saves/Save.vue";

type Save = NonNullable<(typeof saves)["value"]>[number];

const { scenarioId } = defineProps<{
  scenarioId: string;
}>();

const queryClient = useQueryClient();
const { data: saves } = useSavesQuery(
  scenarioId,
  env.VITE_EXPERIMENTAL_IMMERSIVE_MODE ? undefined : false,
);
const selectionMode = ref(false);
const selectedSaveIds = ref<number[]>([]);
const deletionInProgress = ref(false);

/**
 * Saves grouped by date (`[{ date: string, saves: Object }]`).
 */
const savesGroupedByDate = computed(() => {
  if (!saves.value) return [];

  const grouped = new Map<string, Save[]>();

  for (const save of saves.value) {
    const date = save.createdAt!.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });

    const weekday = save.createdAt!.toLocaleDateString(undefined, {
      weekday: "short",
    });

    const fullDate = `${weekday} ${date}`;

    if (!grouped.has(fullDate)) {
      grouped.set(fullDate, []);
    }

    grouped.get(fullDate)!.push(save);
  }

  console.log("Grouped saves", Array.from(grouped));

  return Array.from(grouped).map(([date, saves]) => ({
    date,
    saves,
  }));
});

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

onMounted(() => {
  trackPageview(`/saves/${scenarioId}`);
});
</script>

<template lang="pug">
.relative.flex.flex-col.overflow-y-hidden
  //- Header.
  RichTitle.border-b.p-3(title="Load game")
    template(#icon)
      HistoryIcon(:size="20")
    template(#extra)
      .flex.items-center
        //- TODO: Filter by mode.
        //- TODO: Filter by favorites.
        //- Toggle selection mode.
        button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
          @click="selectionMode = !selectionMode; selectedSaveIds = []"
          title="Switch to selection mode"
          v-tooltip="'Switch to selection mode'"
          :disabled="savesGroupedByDate.length === 0"
        )
          SquareMousePointerIcon(
            :size="18"
            :class="{ 'text-primary-500': selectionMode }"
          )

  //- Saves.
  .flex.h-full.w-full.flex-col.gap-2.overflow-y-auto.p-3(class="@container")
    ul.flex.flex-col.gap-2(
      v-if="savesGroupedByDate.length"
      v-for="group of savesGroupedByDate"
      :key="group.date"
    )
      //- Date.
      RichTitle(:title="group.date")
        span.cursor-help.font-semibold.leading-snug.tracking-wide(
          v-tooltip="`Games created ${group.saves[0].createdAt?.toLocaleDateString()}`"
        ) {{ group.date }}

      //- Saves.
      ul.grid.w-full.gap-2(
        class="@sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4"
        :class="{ 'h-full': !saves?.length }"
      )
        li.cursor-pointer(
          v-for="simulation of group.saves"
          :key="simulation.id"
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
    .flex.h-full.w-full.flex-col.items-center.justify-center.gap-2.p-3.opacity-50(
      v-else
    )
      CircleSlash2Icon(:size="32")
      p No saves found.

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
