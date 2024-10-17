<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
import * as api from "@/lib/api";
import { accountQueryKey, useAccountQuery } from "@/lib/queries";
import router, { routeLocation } from "@/router";
import { clearUser } from "@/store";
import { useQueryClient } from "@tanstack/vue-query";
import { CreditCardIcon, LogOutIcon, MailIcon } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const queryClient = useQueryClient();

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
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
  emit("close");

  router.push(routeLocation({ name: "Home" }));
}

const { t } = useI18n({
  messages: {
    "en-US": {
      user: {
        account: {
          settings: {
            email: "Email",
            subscription: {
              label: "Subscription",
              tier: {
                none: "None",
                basic: "Basic",
                premium: "Premium",
              },
              until: "until {date}",
              seePricing: "See pricing",
            },
            patreon: {
              label: "Patreon",
              linked: "Linked",
              seeTiers: "See tiers",
              link: "Link",
            },
          },
          logout: "Log out",
        },
      },
    },
  },
});
</script>

<template lang="pug">
Modal.max-h-full.w-full.max-w-md.rounded-lg.bg-white(
  title="Account settings"
  :open
  @close="$emit('close')"
)
  .flex.flex-col.gap-1.p-3
    RichTitle(:title="t('user.account.settings.email')")
      template(#icon)
        MailIcon(:size="18")
      template(#extra)
        span.font-mono {{ accountQuery.data.value?.email }}

    RichTitle(:title="t('user.account.settings.subscription.label')")
      template(#icon)
        CreditCardIcon(:size="18")
      template(#extra)
        .flex.items-center.gap-2
          span(v-if="accountQuery.data.value?.subscription")
            | {{ t(`user.account.settings.subscription.tier.${accountQuery.data.value.subscription.tier}`) }}
            |
            | ({{ t("user.account.settings.subscription.until", { date: new Date(accountQuery.data.value.subscription.activeUntil).toLocaleDateString() }) }})
          template(v-else)
            span {{ t("user.account.settings.subscription.tier.none") }}
            RouterLink.btn-pressable.btn.btn-primary.btn-md.rounded-lg(
              :to="routeLocation({ name: 'Pricing' })"
            ) {{ t("user.account.settings.subscription.seePricing") }}

    RichTitle(:title="t('user.account.settings.patreon.label')")
      template(#icon)
        img(src="/img/patreon.svg" class="h-[1.1rem]")
      template(#extra)
        .flex.flex-col.items-end(v-if="patreon")
          span
            | {{ t("user.account.settings.patreon.linked") }}&nbsp;
            span(v-if="patreon.tier") ({{ patreon.tier.name }})
            a.dz-link(
              v-else
              :href="env.VITE_PATREON_CAMPAIGN_URL"
              target="_blank"
            ) {{ t("user.account.settings.patreon.seeTiers") }}
        button.dz-link.dz-link-primary(v-else @click="linkPatreon") {{ t("user.account.settings.patreon.link") }}

    button.btn.btn-neutral.btn-pressable-sm.btn-md.mt-1.w-full.rounded-lg(
      @click="logout"
      class="hover:btn-error"
    )
      LogOutIcon(:size="18" :stroke-width="2.5")
      | {{ t("user.account.logout") }}
</template>
