<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
import * as api from "@/lib/api";
import { accountQueryKey, useAccountQuery } from "@/lib/queries";
import router, { routeLocation } from "@/router";
import { clearUser } from "@/store";
import { useQueryClient } from "@tanstack/vue-query";
import {
  CreditCardIcon,
  LogOutIcon,
  MailIcon,
  UserCircle2Icon,
} from "lucide-vue-next";
import { computed } from "vue";

const queryClient = useQueryClient();

defineProps<{
  open: boolean;
}>();

defineEmits<{
  (event: "close"): void;
}>();

const accountQuery = useAccountQuery();
const patreon = computed(() => accountQuery.data.value?.oAuthAccounts.patreon);

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
Modal.max-h-full.w-full.max-w-md.rounded-lg.bg-white(
  title="Account settings"
  :open
  @close="$emit('close')"
)
  template(#icon)
    UserCircle2Icon(:size="20")

  .flex.flex-col.gap-1.p-3
    RichTitle(title="Email")
      template(#icon)
        MailIcon(:size="18")
      template(#extra)
        span.font-mono {{ accountQuery.data.value?.email }}

    RichTitle(title="Subscription")
      template(#icon)
        CreditCardIcon(:size="18")
      template(#extra)
        .flex.items-center.gap-2
          span.font-mono {{ accountQuery.data.value?.subscription?.tier ?? "None" }}
          RouterLink.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
            v-if="accountQuery.data.value?.subscription === null"
            :to="routeLocation({ name: 'Pricing' })"
          ) See pricing

    RichTitle(title="Patreon")
      template(#icon)
        img(src="/img/patreon.svg" class="h-[1.1rem]")
      template(#extra)
        .flex.flex-col.items-end(v-if="patreon")
          span
            | Linked&nbsp;
            span(v-if="patreon.tier") ({{ patreon.tier.name }})
            a.dz-link(
              v-else
              :href="env.VITE_PATREON_CAMPAIGN_URL"
              target="_blank"
            ) See tiers
        button.dz-link.dz-link-primary(v-else @click="linkPatreon") Link

    button.btn.btn-neutral.btn-pressable-sm.btn-md.mt-1.w-full.rounded-lg(
      @click="logout"
      class="hover:btn-error"
    )
      LogOutIcon(:size="18" :stroke-width="2.5")
      | Logout
</template>
