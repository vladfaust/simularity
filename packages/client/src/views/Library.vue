<script setup lang="ts">
import Header from "@/components/Browser/Header.vue";
import CustomTitle from "@/components/CustomTitle.vue";
import { d } from "@/lib/drizzle";
import * as resources from "@/lib/resources";
import { readScenarios, type Scenario } from "@/lib/simulation/scenario";
import { showLibrarySaves } from "@/lib/storage";
import * as tauri from "@/lib/tauri";
import { routeLocation } from "@/router";
import { BaseDirectory } from "@tauri-apps/api/fs";
import { desc, eq, isNull } from "drizzle-orm";
import {
  ChevronDownIcon,
  FolderOpenIcon,
  HistoryIcon,
  ScrollTextIcon,
  Trash2Icon,
} from "lucide-vue-next";
import { computed, onMounted, ref, shallowRef, triggerRef } from "vue";
import ScenarioVue from "./Library/Scenario.vue";
import Save from "./Scenario/Save.vue";

const scenarios = shallowRef<Scenario[]>([]);
const search = ref("");
const saves = shallowRef<Pick<typeof d.simulations.$inferSelect, "id">[]>([]);

const filteredScenarios = computed(() =>
  scenarios.value.filter((scenario) =>
    scenario.content.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
);

async function openScenariosDir() {
  await tauri.utils.fileManagerOpen(await resources.scenariosDir());
}

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
  scenarios.value.push(...(await readScenarios(BaseDirectory.Resource)));
  scenarios.value.push(...(await readScenarios(BaseDirectory.AppLocalData)));
  triggerRef(scenarios);

  d.db.query.simulations
    .findMany({
      columns: { id: true },
      orderBy: desc(d.simulations.updatedAt),
      where: isNull(d.simulations.deletedAt),
    })
    .then((value) => (saves.value = value));
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
    //- Recent plays.
    .flex.w-full.max-w-4xl.flex-col.gap-2.px-3(v-if="!search")
      CustomTitle.cursor-pointer(
        title="Continue playing"
        @click="showLibrarySaves = !showLibrarySaves"
      )
        template(#icon)
          HistoryIcon(:size="18")
        template(#extra)
          .flex.items-center.gap-1
            span {{ saves.length }}
            .rounded.border.bg-white.transition-transform.pressable
              ChevronDownIcon.transition(
                :size="18"
                :class="{ '-rotate-180': showLibrarySaves }"
              )

      ul.-mx-1.-my-4.flex.w-full.gap-2.overflow-x-scroll.px-1.py-4(
        :class="{ hidden: !showLibrarySaves }"
        class="@container"
      )
        li.relative.w-full.shrink-0(
          v-for="simulation of saves"
          class="@sm:w-[calc(100%/2-0.3rem)] @lg:w-[calc(100%/3-0.4rem)] @3xl:w-[calc(100%/4-0.4rem)]"
        )
          //- Delete button.
          .absolute.-right-1.-top-1.z-20
            button.btn.rounded.bg-white.p-1.shadow.transition.pressable(
              @click.stop="deleteSave(simulation.id)"
              class="hover:text-red-500"
            )
              Trash2Icon(:size="16")

          RouterLink(
            :to="routeLocation({ name: 'Simulation', params: { simulationId: simulation.id } })"
          )
            Save.overflow-hidden.rounded-lg.bg-white.shadow-lg.transition-transform.pressable(
              :simulation-id="simulation.id"
              :key="simulation.id"
            )

    .flex.w-full.max-w-4xl.flex-col.gap-2.px-3
      CustomTitle.w-full(title="Scenarios")
        template(#icon)
          ScrollTextIcon(:size="18")
        template(#extra) {{ filteredScenarios.length }}

      ul.grid.w-full.w-full.max-w-4xl.gap-2(class="2xs:grid-cols-2 xs:grid-cols-3")
        li.cursor-pointer.overflow-hidden.rounded-lg.border.bg-white.shadow-lg.transition-transform.pressable(
          v-for="scenario in filteredScenarios"
          :key="scenario.id"
          :title="scenario.content.name"
          class="active:shadow-sm"
        )
          RouterLink(
            :to="routeLocation({ name: 'Scenario', params: { scenarioId: scenario.id } })"
          )
            ScenarioVue(:scenario)
</template>
