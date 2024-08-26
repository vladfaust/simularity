<script setup lang="ts">
import { Grid2x2CheckIcon } from "lucide-vue-next";
defineProps<{ iconSize?: number }>();
</script>

<template lang="pug">
.rounded.bg-primary-500.p-1(title="Active on stage")
  Grid2x2CheckIcon.text-primary-base.drop-shadow(:size="iconSize ?? 16")
</template>
