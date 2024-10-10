<script setup lang="ts">
import RichInput from "./RichInput.vue";

defineProps<{
  title: string;
  id: string;
  values: {
    value: string;
    label?: string;
  }[];
  allowEmpty?: boolean;
  help?: string;
  disabled?: boolean;
}>();

const model = defineModel<string | null>();
</script>

<template lang="pug">
RichInput(:title :id :help v-model="model" :disabled)
  template(#icon)
    slot(name="icon")
  select(:id v-model="model" :disabled)
    option(v-if="allowEmpty" value=null)
    option(v-for="{ value, label } in values" :value="value") {{ label ?? value }}
</template>
