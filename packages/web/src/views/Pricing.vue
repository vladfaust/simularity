<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import SubscriptionIcon from "@/components/Icons/SubscriptionIcon.vue";
import * as api from "@/lib/api";
import { useAccountQuery, useRemoteScenariosQuery } from "@/lib/queries";
import { useQuery } from "@tanstack/vue-query";
import { CheckIcon, CreditCardIcon, DownloadIcon } from "lucide-vue-next";
import { computed, ref } from "vue";
import PricingCard from "./Pricing/PricingCard.vue";
import SubscriptionModal from "./Pricing/SubscriptionModal.vue";

const accountQuery = useAccountQuery();

const { data: freeScenarioIds } = useRemoteScenariosQuery(
  true,
  undefined,
  null,
);

const { data: basicScenarioIds } = useRemoteScenariosQuery(
  true,
  undefined,
  "basic",
);

const { data: premiumScenarioIds } = useRemoteScenariosQuery(
  true,
  undefined,
  "premium",
);

const writerModelsQuery = useQuery({
  queryKey: ["writerModels"],
  queryFn: () =>
    api.trpc.commandsClient.models.indexLlmModels.query({
      task: "writer",
    }),
  staleTime: Infinity,
});

const basicWriterModelsNames = computed(() => {
  return writerModelsQuery.data?.value
    ?.filter((m) => m.requiredSubscriptionTier !== "premium")
    .map((m) => m.name);
});

const premiumWriterModelsNames = computed(() => {
  return writerModelsQuery.data?.value?.map((m) => m.name);
});

const voicerModelsQuery = useQuery({
  queryKey: ["voicerModels"],
  queryFn: () => api.trpc.commandsClient.models.indexTtsModels.query(),
  staleTime: Infinity,
});

const basicVoicerModelsNames = computed(() => {
  return voicerModelsQuery.data?.value
    ?.filter((m) => m.requiredSubscriptionTier !== "premium")
    .map((m) => m.name);
});

const premiumVoicerModelsNames = computed(() => {
  return voicerModelsQuery.data?.value?.map((m) => m.name);
});

const subscriptionModalOpen = ref(false);
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.h-full.flex-col.items-center.overflow-y-scroll.bg-neutral-100.p-3
    .flex.w-full.max-w-4xl.flex-col
      .flex.flex-col-reverse.gap-3(class="lg:grid lg:grid-cols-3")
        //- Free plan.
        PricingCard._pricing-card(
          title="Free"
          info="You can run AI models locally for free, forever."
          :scenarios-count="freeScenarioIds?.length ?? 0"
        )
          template(#action)
            button.btn-pressable.btn.btn-neutral.btn-lg.w-full.rounded-lg
              DownloadIcon(:size="20")
              | Download app

        //- Basic plan.
        PricingCard._pricing-card(
          title="Basic"
          info="Basic subscription gives you access to unlimited cloud inference and more scenarios to play with."
          :scenarios-count="(freeScenarioIds?.length ?? 0) + (basicScenarioIds?.length ?? 0)"
          :writer-cloud-models="basicWriterModelsNames"
          :voicer-cloud-models="basicVoicerModelsNames"
          :price-monthly="10"
          :discord-role="true"
          :vote-for-scenarios="true"
        )
          template(#icon)
            SubscriptionIcon(:size="18" tier="basic")

          template(#action)
            .btn.btn-success.btn-lg.w-full.rounded-lg(
              v-if="accountQuery.data.value?.subscription?.tier === 'basic'"
            )
              CheckIcon(:size="20")
              | Active subscription

            .btn.btn-neutral.btn-lg.w-full.rounded-lg(
              v-else-if="accountQuery.data.value?.subscription?.tier === 'premium'"
            )
              CheckIcon(:size="20")
              | Subscribed to premium

            button.btn-pressable.btn.btn-primary.btn-lg.w-full.rounded-lg(
              v-else
              @click="subscriptionModalOpen = true"
            )
              CreditCardIcon(:size="20")
              | Subscribe for $10/mo

        //- Premium plan.
        PricingCard._pricing-card(
          title="Premium"
          info="Premium subscription unlocks more powerful models for cloud inference and includes even more scenarios."
          :scenarios-count="(freeScenarioIds?.length ?? 0) + (basicScenarioIds?.length ?? 0) + (premiumScenarioIds?.length ?? 0)"
          :nsfw-scenarios="true"
          :writer-cloud-models="premiumWriterModelsNames"
          :voicer-cloud-models="premiumVoicerModelsNames"
          :price-monthly="25"
          :experimental-features="true"
          :discord-role="true"
          :vote-for-scenarios="true"
        )
          template(#icon)
            SubscriptionIcon(:size="18" tier="premium")

          template(#action)
            .btn.btn-success.btn-lg.w-full.rounded-lg(
              v-if="accountQuery.data.value?.subscription?.tier === 'premium'"
            )
              CheckIcon(:size="20")
              | Active subscription

            button.btn-pressable.btn.btn-primary.btn-lg.w-full.rounded-lg(
              v-else
              @click="subscriptionModalOpen = true"
            )
              CreditCardIcon(:size="20")
              | Subscribe for $25/mo

  SubscriptionModal.w-full.max-w-md.rounded-lg.bg-white(
    :open="subscriptionModalOpen"
    @close="subscriptionModalOpen = false"
  )
</template>

<style lang="postcss" scoped>
._pricing-card {
  @apply h-max rounded-lg border bg-white shadow-lg;
}
</style>
