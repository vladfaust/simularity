<script setup lang="ts">
import type { v } from "@/lib/valibot";
import type { SubscriptionTierSchema } from "@simularity/api/lib/schema";
import { CrownIcon } from "lucide-vue-next";

defineProps<{
  tier?: v.InferOutput<typeof SubscriptionTierSchema>;
}>();
</script>

<template lang="pug">
CrownIcon(
  :class="{ 'text-blue-500': tier === 'basic', 'text-purple-500': tier === 'premium' }"
)
</template>
