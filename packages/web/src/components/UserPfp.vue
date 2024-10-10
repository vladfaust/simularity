<script setup lang="ts">
import { env } from "@/env";
import { useUserQuery } from "@/lib/queries";
import { computed } from "vue";
import Jdenticon from "./Jdenticon.vue";

const { userId } = defineProps<{ userId: string }>();
const userQuery = useUserQuery(userId);

const pfp = computed(() => userQuery.data.value?.pfp);
const pfpUrl = computed(() => {
  if (pfp.value) {
    return (
      env.VITE_API_BASE_URL +
      `/rest/v1/users/${userId}/pfp/${pfp.value.hash}${pfp.value.extension ? `.${pfp.value.extension}` : ""}`
    );
  }
});
</script>

<template lang="pug">
img(
  v-if="pfpUrl"
  :src="pfpUrl"
  :alt="`${userQuery.data.value?.username || userId}'s profile picture`"
)
Jdenticon(
  v-else
  :input="userId"
  :alt="`${userQuery.data.value?.username || userId}'s profile picture`"
)
</template>
