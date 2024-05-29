<script setup lang="ts">
import { EpisodeUpdate } from "@/lib/simulation/updates";
defineProps<{ update: EpisodeUpdate }>();
</script>

<template lang="pug">
p.rounded-lg.rounded-bl-none.bg-white.px-3.py-3.leading-snug.opacity-90.transition-opacity(
  class="hover:opacity-100"
) {{ update.text }}
</template>
