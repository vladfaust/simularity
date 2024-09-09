<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core";
import { CherryIcon } from "lucide-vue-next";
import { ref } from "vue";
import SavesVue from "@/components/Saves.vue";
import Header from "@/components/Browser/Header.vue";

const search = ref("");
const showNsfw = useLocalStorage("showNsfw", false);
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.bg-neutral-100
  .flex.w-full.justify-center.bg-white
    Header.h-full.w-full.max-w-4xl

  .flex.w-full.justify-center.border-t.bg-white
    .flex.w-full.max-w-4xl.items-center.justify-between.gap-2.p-3
      input.w-full.rounded-lg.bg-neutral-100.px-2.py-1.text-sm.italic.shadow-inner(
        v-model="search"
        placeholder="Filter by scenario name..."
      )
      button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
        @click="showNsfw = !showNsfw"
        title="Toggle NSFW"
        v-tooltip="'Toggle NSFW'"
      )
        CherryIcon(:size="18" :class="{ 'text-red-500': showNsfw }")

  .flex.h-full.w-full.flex-col.items-center.gap-3.overflow-y-auto.py-3.shadow-inner
    //- Saves.
    SavesVue.w-full.max-w-4xl.gap-2.px-3(
      :expand="true"
      :hide-expand-button="true"
      :hide-nsfw="!showNsfw"
      :filter-scenario-name="search"
    )
</template>
