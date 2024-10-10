<script setup lang="ts">
import * as jdenticon from "jdenticon";
import { onMounted, type Ref, ref, watch } from "vue";

const props = defineProps<{ input: any }>();

const svgRef: Ref<SVGElement | null> = ref(null);

function updateSvg() {
  jdenticon.updateSvg(svgRef.value!, props.input);
}

onMounted(() => {
  updateSvg();
});

watch(
  () => props.input,
  () => {
    updateSvg();
  },
);
</script>

<template lang="pug">
svg(ref="svgRef")
</template>
