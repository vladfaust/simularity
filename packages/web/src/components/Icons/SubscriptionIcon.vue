<script setup lang="ts">
import { type SubscriptionTier } from "@simularity/api/lib/schema";
import { GemIcon } from "lucide-vue-next";

defineProps<{
  tier?: SubscriptionTier;
}>();
</script>

<template lang="pug">
GemIcon(
  :class="{ 'text-blue-500': tier === 'basic', 'text-purple-500': tier === 'premium' }"
)
</template>
