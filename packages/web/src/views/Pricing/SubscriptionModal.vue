<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import { env } from "@/env";
import * as api from "@/lib/api";
import { useAccountQuery } from "@/lib/queries";
import { userId } from "@/store";
import { CheckIcon, ExternalLinkIcon } from "lucide-vue-next";
import { computed } from "vue";

defineProps<{
  open: boolean;
}>();

defineEmits<{
  (event: "close"): void;
}>();

const accountQuery = useAccountQuery();
const patreonAccount = computed(
  () => accountQuery.data.value?.oAuthAccounts.patreon,
);

async function linkPatreon() {
  const { url } = await api.trpc.commandsClient.auth.oauth.create.mutate({
    providerId: "patreon",
    reason: "link",
  });

  window.location.href = url;
}
</script>

<template lang="pug">
Modal.flex.flex-col(:open @close="$emit('close')" title="Subscription")
  .flex.flex-col.gap-2.p-3
    p.leading-snug
      | Currently, subscriptions are handled exclusively through Patreon.
    p.leading-snug
      span(:class="{ 'line-through italic': patreonAccount }") 1. Make sure that your account is linked to Patreon to access the benefits.
      CheckIcon.mx-1.-mt-1.inline-block.text-success-500(
        v-if="patreonAccount"
        :size="18"
        :stroke-width="2.5"
      )

    .flex.items-center.justify-between.gap-2(v-if="userId && !patreonAccount")
      span.shrink-0.font-medium Patreon account
      .w-full.border-b
      button.btn-sm.btn.btn-pressable.shrink-0.gap-1.underline(
        @click="linkPatreon"
      )
        | Link

    p.leading-snug 2. Visit the Patreon page to manage your subscription.

    a.btn.btn-lg.mt-1.rounded-lg.text-white(
      :href="env.VITE_PATREON_CAMPAIGN_URL"
      class="bg-[#fc664d]"
      target="_blank"
    )
      img.h-8(src="/img/patreon.svg")
      | Visit Patreon page
      ExternalLinkIcon.text-white(:size="18")
</template>
