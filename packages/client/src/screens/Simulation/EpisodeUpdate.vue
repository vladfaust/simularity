<script setup lang="ts">
import { EpisodeUpdate } from "@/lib/simulation/updates";
defineProps<{ update: EpisodeUpdate }>();
</script>

<template lang="pug">
p.max-w-md.rounded-lg.px-3.py-3.leading-snug.opacity-90.transition-opacity(
  class="hover:opacity-100"
  :class="{ 'rounded-bl-none place-self-start bg-white': !update.asIfCreatedByUser, 'rounded-br-none place-self-end bg-green-100': update.asIfCreatedByUser }"
) {{ update.text }}
</template>
