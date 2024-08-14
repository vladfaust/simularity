<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { ImageIcon, ImageOffIcon } from "lucide-vue-next";
import { ref } from "vue";
import OnStageMark from "./OnStageMark.vue";
import Scene from "./Scenes/Scene.vue";
import SelectedScene from "./Scenes/SelectedScene.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const selectedSceneId = ref<string | undefined>(
  simulation.state.stage.value.sceneId,
);
</script>

<template lang="pug">
.grid.h-full.grid-cols-3.overflow-y-hidden.rounded-lg.bg-white
  .col-span-2.flex.h-full.flex-col.overflow-y-hidden
    //- Header.
    .flex.w-full.gap-2.border-b.p-3
      .flex.items-center.gap-1
        ImageIcon(:size="20")
        h1.font-semibold.tracking-wide Scenes

    //- Scenes.
    .h-full.overflow-y-auto(@click="selectedSceneId = undefined")
      ul.grid.gap-2.p-3(class="max-lg:grid-cols-3 lg:grid-cols-4")
        li.relative.cursor-pointer.shadow-lg.transition-transform.pressable-sm(
          v-for="[sceneId, scene] in Object.entries(simulation.scenario.scenes)"
          :key="sceneId"
          @click.stop="selectedSceneId = sceneId"
        )
          Scene.overflow-hidden.rounded-lg.border-2(
            :scenario="simulation.scenario"
            :scene
            :selected="selectedSceneId === sceneId"
          )
          OnStageMark.absolute.-bottom-1.-right-1.shadow-lg(
            v-if="simulation.state.stage.value.sceneId === sceneId"
          )

  //- Selected scene.
  SelectedScene.border-l.p-3(
    v-if="selectedSceneId"
    :simulation
    :scene-id="selectedSceneId"
    :scene="simulation.scenario.scenes[selectedSceneId]"
    :key="selectedSceneId"
  )
  .flex.flex-col.items-center.justify-center.border-l.opacity-50(v-else)
    ImageOffIcon(:size="32" :stroke-width="1")
    h1.font-medium No scene selected
</template>
