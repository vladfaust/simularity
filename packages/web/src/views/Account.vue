<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import * as api from "@/lib/api";
import { accountQueryKey, useAccountQuery } from "@/lib/queries";
import router, { routeLocation } from "@/router";
import { clearUser } from "@/store";
import { useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";

const queryClient = useQueryClient();

const accountQuery = useAccountQuery();
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

  router.push(routeLocation({ name: "Home" }));
}
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.h-full.flex-col.items-center.overflow-y-scroll.bg-neutral-100.p-3.shadow-inner
    .flex.w-full.max-w-4xl.flex-col.gap-2
      .flex.justify-between
        span.font-medium Email
        span.font-mono {{ accountQuery.data.value?.email }}

      .flex.justify-between
        span.font-medium Subscription
        .flex.items-center.gap-2
          span.font-mono {{ accountQuery.data.value?.subscription?.tier ?? "None" }}
          RouterLink.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
            v-if="accountQuery.data.value?.subscription === null"
            :to="routeLocation({ name: 'Pricing' })"
          ) See pricing

      .flex.justify-between
        span.font-medium Patreon
        .flex.flex-col.items-end(v-if="patreon")
          span
            | Linked&nbsp;
            span(v-if="patreon.tier") ({{ patreon.tier.name }})
            a.dz-link(v-else :href="patreonCampaignUrl" target="_blank") See tiers
          span.text-sm.italic.leading-tight(v-if="patreon.tier") until {{ new Date(patreon.tier.activeUntil).toLocaleDateString() }}
        button.dz-link.dz-link-primary(v-else @click="linkPatreon") Link

      button.btn.btn-neutral.btn-pressable-sm.btn-md.w-full.rounded-lg.border(
        @click="logout"
        class="hover:dz-btn-error"
      ) Logout
</template>
