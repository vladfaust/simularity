<script setup lang="ts">
const model = defineModel<number | undefined>({
  type: Number,
  set: (value) => {
    if (!value) {
      return undefined;
    } else {
      return value;
    }
  },
});
</script>

<template lang="pug">
input(type="number" v-model="model" placeholder="Default")
</template>
