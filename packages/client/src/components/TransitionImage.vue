<script setup lang="ts">
import { watchImmediate } from "@vueuse/core";
import { ref } from "vue";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{
  src: string;
  name?: string;
}>();

const loaded = ref(false);

watchImmediate(
  () => props.src,
  () => {
    loaded.value = false;
  },
);
</script>

<template lang="pug">
Transition(:name="name ?? 'fade'")
  img(v-bind="$attrs" v-show="loaded" :key="src" :src @load="loaded = true")
</template>

<style lang="scss">
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
