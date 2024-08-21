<script setup lang="ts">
import { routeLocation } from "@/lib/router";
import { ArrowLeft } from "lucide-vue-next";
</script>

<template lang="pug">
.flex.flex-col
  .flex.border-b.p-3
    RouterLink.btn.btn-md.rounded-lg.border(
      :to="routeLocation({ name: 'MainMenu' })"
    )
      ArrowLeft(:size="20")
      span Back to main menu
</template>
