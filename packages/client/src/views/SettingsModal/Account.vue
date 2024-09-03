<script setup lang="ts">
import CustomTitle from "@/components/CustomTitle.vue";
import { confirm_ } from "@/lib/resources";
import { remoteServerJwt } from "@/lib/storage";
import { currentUserQueryKey, useCurrentUserQuery } from "@/queries";
import { useQueryClient } from "@tanstack/vue-query";
import {
  CircleDollarSignIcon,
  Loader2Icon,
  LogOutIcon,
  MailIcon,
} from "lucide-vue-next";

const emit = defineEmits<{
  (event: "logout"): void;
}>();

const userQuery = useCurrentUserQuery();
const queryClient = useQueryClient();

async function logout() {
  if (
    !(await confirm_("Are you sure you want to log out?", {
      title: "Log out",
      okLabel: "Log out",
    }))
  ) {
    return;
  }

  remoteServerJwt.value = null;
  queryClient.invalidateQueries({ queryKey: currentUserQueryKey() });

  emit("logout");
}
</script>

<template lang="pug">
.flex.min-h-full.flex-col.gap-2.p-3
  .grid.place-items-center(v-if="userQuery.isLoading.value")
    Loader2Icon.animate-spin(:size="20")

  .flex.flex-col.gap-2(v-else-if="userQuery.data.value")
    CustomTitle(title="E-mail")
      template(#icon)
        MailIcon(:size="20")
      template(#extra)
        .font-mono {{ userQuery.data.value?.email }}
    CustomTitle(title="Credits")
      template(#icon)
        CircleDollarSignIcon(:size="20")
      template(#extra)
        .font-mono {{ userQuery.data.value?.creditBalance ?? 0 }}¢

  div
    button.btn.btn-md.w-full.rounded.border.transition.pressable-sm(
      @click="logout"
      class="hover:btn-error"
    )
      LogOutIcon(:size="20")
      span Log out
</template>
