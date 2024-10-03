<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import * as api from "@/lib/api";
import {
  accountBalanceQueryKey,
  accountQueryKey,
  useAccountBalanceQuery,
  useAccountQuery,
} from "@/lib/queries";
import router, { routeLocation } from "@/router";
import { clearUser } from "@/store";
import { useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";

const queryClient = useQueryClient();

const accountQuery = useAccountQuery();
const accountBalanceQuery = useAccountBalanceQuery();
const patreon = computed(() => accountQuery.data.value?.oAuthAccounts.patreon);

const patreonCampaignUrl = import.meta.env.VITE_PATREON_CAMPAIGN_URL;

async function linkPatreon() {
  const { url } = await api.trpc.commandsClient.auth.oauth.create.mutate({
    providerId: "patreon",
    reason: "link",
  });

  window.location.href = url;
}

function logout() {
  if (!confirm("Are you sure you want to log out?")) {
    return;
  }

  clearUser();

  queryClient.invalidateQueries({ queryKey: accountQueryKey() });
  queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });

  router.push(routeLocation({ name: "Home" }));
}
</script>

<template lang="pug">
.flex.flex-col.items-center
  HeaderVue.w-full.border-b
  .flex.w-full.max-w-xl.flex-col.gap-2.p-3
    .flex.justify-between
      span.font-medium Email
      span.font-mono {{ accountQuery.data.value?.email }}

    .flex.justify-between
      span.font-medium Balance
      span.font-mono {{ accountBalanceQuery.data.value?.credit }}¢

    .flex.justify-between
      span.font-medium Patreon
      .flex.flex-col.items-end(v-if="patreon")
        span
          | Linked&nbsp;
          span(v-if="patreon.tier") ({{ patreon.tier.name }})
          a.dz-link(v-else :href="patreonCampaignUrl" target="_blank") See tiers
        span.text-sm.italic.leading-tight(v-if="patreon.tier") until {{ new Date(patreon.tier.activeUntil).toLocaleDateString() }}
      button.dz-link.dz-link-primary(v-else @click="linkPatreon") Link

    button.dz-btn.dz-btn-md.w-full(@click="logout" class="hover:dz-btn-error") Logout
</template>
