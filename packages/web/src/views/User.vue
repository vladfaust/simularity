<script setup lang="ts">
import HeaderVue from "@/components/Header.vue";
import Placeholder from "@/components/Placeholder.vue";
import UserPfp from "@/components/UserPfp.vue";
import { env } from "@/env";
import { useUserQuery } from "@/lib/queries";
import { userId } from "@/store";
import { PaletteIcon, Settings2Icon } from "lucide-vue-next";
import { computed, ref } from "vue";
import WrapBalancer from "vue-wrap-balancer";
import AccountModal from "./User/AccountModal.vue";
import UserSettingsModal from "./User/UserSettingsModal.vue";

const props = defineProps<{
  userId: string;
}>();

const userQuery = useUserQuery(props.userId);
const isSelf = computed(() => userId.value === props.userId);
const userSettingsModalOpen = ref(false);
const accountModalOpen = ref(false);

const bgp = computed(() => userQuery.data.value?.bgp);
const bgpUrl = computed(() => {
  if (bgp.value) {
    return (
      env.VITE_API_BASE_URL +
      `/rest/v1/users/${props.userId}/bgp/${bgp.value.hash}${bgp.value.extension ? `.${bgp.value.extension}` : ""}`
    );
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.overflow-y-hidden
  .flex.flex-col.items-center
    HeaderVue.w-full.border-b

  .flex.h-full.w-full.flex-col.items-center.overflow-y-scroll.bg-neutral-100.px-3.pb-3
    .flex.w-full.max-w-4xl.flex-col
      img.h-48.w-full.rounded-b-lg.object-cover(
        v-if="bgpUrl"
        :src="bgpUrl"
        alt="Background picture"
      )
      Placeholder.h-48.w-full.rounded-b-lg(v-else)
      .-mt-16.flex.w-full.flex-col.items-center.gap-2
        UserPfp.aspect-square.w-32.rounded-lg.border-4.border-white.object-cover.shadow-lg(
          :user-id="props.userId"
        )
        .flex.flex-col.items-center
          span.font-medium {{ userQuery.data.value?.username }}
          WrapBalancer.max-w-md.text-center.leading-snug(as="p") {{ userQuery.data.value?.bio }}

        .flex.items-center.gap-2
          button.btn.btn-lg.btn-neutral.btn-pressable.rounded-lg(
            v-if="isSelf"
            @click="userSettingsModalOpen = true"
          )
            PaletteIcon(:size="20")
            | Edit profile
          button.btn.btn-lg.btn-neutral.btn-pressable.rounded-lg(
            v-if="isSelf"
            @click="accountModalOpen = true"
          )
            Settings2Icon(:size="20")
            | Account

  UserSettingsModal(
    :open="userSettingsModalOpen"
    :user-id="props.userId"
    @close="userSettingsModalOpen = false"
  )

  AccountModal(:open="accountModalOpen" @close="accountModalOpen = false")
</template>
