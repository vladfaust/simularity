<script setup lang="ts">
import Agent from "./Settings/Agent.vue";
</script>

<template lang="pug">
.flex.flex-col.gap-2.p-3
  h1.text-lg.font-semibold.leading-tight.tracking-wide Settings
  h2.font-medium.leading-tight.tracking-wide Writer
  Agent(:agent-id="'writer'")
  h2.font-medium.leading-tight.tracking-wide Director
  Agent(:agent-id="'director'")
</template>
