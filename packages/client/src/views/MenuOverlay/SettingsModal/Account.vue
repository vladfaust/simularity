<script setup lang="ts">
import Account from "@/components/Account.vue";

const emit = defineEmits<{
  (event: "logout"): void;
}>();
</script>

<template lang="pug">
Account.flex.min-h-full.flex-col.gap-2.p-3(@logout="emit('logout')")
</template>
