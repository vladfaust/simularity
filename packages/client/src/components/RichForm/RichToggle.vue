<script setup lang="ts">
import RichInput from "./RichInput.vue";
import Toggle from "./Toggle.vue";

defineProps<{
  title: string;
  id: string;
  help?: string;
}>();

const model = defineModel<boolean>();
</script>

<template lang="pug">
RichInput(:title :id :help v-model="model")
  template(#icon)
    slot(name="icon")
  Toggle(:id="id" v-model="model" size="sm")
</template>
