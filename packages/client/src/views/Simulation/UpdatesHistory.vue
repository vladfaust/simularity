<script setup lang="ts">
import { Simulation } from "@/lib/simulation";
import { minDelay, sleep } from "@/lib/utils";
import { useInfiniteScroll } from "@vueuse/core";
import { LoaderIcon } from "lucide-vue-next";
import { onMounted, ref, watch } from "vue";
import UpdateVue from "./Update.vue";

const { simulation } = defineProps<{
  simulation: Simulation;
}>();

const emit = defineEmits<{
  (event: "triggerEditHandler", handler: () => void): void;
  (event: "triggerNextVariantHandler", handler: () => void): void;
  (event: "triggerPreviousVariantHandler", handler: () => void): void;
  (event: "chooseVariant", updateIndex: number, variantIndex: number): void;
  (event: "regenerate", updateIndex: number): void;
  (
    event: "edit",
    updateIndex: number,
    variantIndex: number,
    newText: string,
  ): void;
  (event: "beginEdit", updateIndex: number): void;
  (event: "stopEdit", updateIndex: number): void;
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const INFINITE_LOAD_DELAY = 1000;
const INFINITE_LOAD_LIMIT = 10;

const isEditingMap = ref(new Map<number, boolean>());
const triggerEditHandlerMap = new Map<number, () => void>();
const triggerPreviousVariantHandlerMap = new Map<number, () => void>();
const triggerNextVariantHandlerMap = new Map<number, () => void>();

// Top infinite scroll (historical updates).
const topScrollIsLoading = ref(false);
useInfiniteScroll(
  scrollContainer,
  async () => {
    if (
      !topScrollIsLoading.value &&
      simulation.canLoadMoreHistoricalUpdates.value
    ) {
      console.log("Loading more historical updates");

      try {
        topScrollIsLoading.value = true;
        await minDelay(
          simulation.loadMoreHistoricalUpdates(INFINITE_LOAD_LIMIT),
          INFINITE_LOAD_DELAY,
        );
      } catch (e: any) {
        console.error("Error loading more historical updates", e);
        throw e;
      } finally {
        topScrollIsLoading.value = false;
      }
    }
  },
  {
    direction: "top",
    throttle: 500,
    interval: 500,
    canLoadMore: () => simulation.canLoadMoreHistoricalUpdates.value,
  },
);

// Bottom infinite scroll (future updates).
const bottomScrollIsLoading = ref(false);
useInfiniteScroll(
  scrollContainer,
  async () => {
    if (!bottomScrollIsLoading.value && simulation.nextUpdateId.value) {
      console.log("Loading more future updates");

      try {
        bottomScrollIsLoading.value = true;
        await minDelay(
          simulation.loadMoreFutureUpdates(INFINITE_LOAD_LIMIT),
          INFINITE_LOAD_DELAY,
        );
      } catch (e: any) {
        console.error("Error loading more future updates", e);
        throw e;
      } finally {
        bottomScrollIsLoading.value = false;
      }
    }
  },
  {
    direction: "bottom",
    throttle: 500,
    interval: 500,
    canLoadMore: () => !!simulation.nextUpdateId.value,
  },
);

watch(
  () => simulation.currentUpdate.value?.chosenVariant?.writerUpdate.id,
  (currentWriterUpdateId) => {
    console.debug({
      currentWriterUpdateId,
      currentIndex: simulation.currentUpdateIndex.value,
    });

    // OPTIMIZE: Wait until the simulation has done updating.
    sleep(100).then(() => scrollToUpdate(simulation.currentUpdateIndex.value));
  },
);

function scrollToUpdate(index: number) {
  // TODO: Pulse-animation on the update.
  if (scrollContainer.value) {
    const updateElement = scrollContainer.value.children[
      simulation.updates.value.length - 1 - index
    ] as HTMLElement;

    updateElement.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

onMounted(() => {
  scrollToUpdate(simulation.currentUpdateIndex.value);

  emit("triggerEditHandler", () => {
    triggerEditHandlerMap.get(simulation.currentUpdateIndex.value)?.();
  });

  emit("triggerPreviousVariantHandler", () => {
    triggerPreviousVariantHandlerMap.get(
      simulation.currentUpdateIndex.value,
    )?.();
  });

  emit("triggerNextVariantHandler", () => {
    triggerNextVariantHandlerMap.get(simulation.currentUpdateIndex.value)?.();
  });
});
</script>

<template lang="pug">
._scrollContainer.flex.flex-col-reverse.gap-2.overflow-y-scroll(
  ref="scrollContainer"
)
  .grid.place-items-center.p-2(v-if="bottomScrollIsLoading")
    LoaderIcon.animate-spin(:size="20")
  template(
    v-for="update, i of simulation?.updates.value.slice().reverse()"
    :key="update.parentId || 'root'"
  )
    //- NOTE: `simulation.updates.value.length - 1 - i` because we're iterating in reverse.
    UpdateVue(
      :simulation
      :update
      :can-regenerate="true"
      :can-edit="true"
      :show-variant-navigation="true"
      :is-single="false"
      :selected="simulation.updates.value.length - 1 - i === simulation.currentUpdateIndex.value"
      :update-index="simulation.updates.value.length - 1 - i"
      :is-historical="simulation.updates.value.length - 1 - i < simulation.historicalUpdatesLength.value"
      :is-future="simulation.updates.value.length - 1 - i > simulation.currentUpdateIndex.value"
      @trigger-edit-handler="triggerEditHandlerMap.set(simulation.updates.value.length - 1 - i, $event)"
      @trigger-previous-variant-handler="triggerPreviousVariantHandlerMap.set(simulation.updates.value.length - 1 - i, $event)"
      @trigger-next-variant-handler="triggerNextVariantHandlerMap.set(simulation.updates.value.length - 1 - i, $event)"
      @regenerate="emit('regenerate', simulation.updates.value.length - 1 - i)"
      @begin-edit="() => { isEditingMap.set(i, true); emit('beginEdit', simulation.updates.value.length - 1 - i); }"
      @edit="(variantIndex, newText) => emit('edit', simulation.updates.value.length - 1 - i, variantIndex, newText)"
      @stop-edit="() => { isEditingMap.set(i, false); emit('stopEdit', simulation.updates.value.length - 1 - i); }"
      @choose-variant="(variantIndex) => emit('chooseVariant', simulation.updates.value.length - 1 - i, variantIndex)"
      @click="isEditingMap.get(i) ? undefined : simulation.jumpToIndex(simulation.updates.value.length - 1 - i)"
      :class="{ 'cursor-pointer': !isEditingMap.get(i) }"
    )
  .grid.place-items-center.p-2(v-if="topScrollIsLoading")
    LoaderIcon.animate-spin(:size="20")
</template>
