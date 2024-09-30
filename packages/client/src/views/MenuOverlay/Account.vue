<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import * as api from "@/lib/api";
import { confirm_ } from "@/lib/resources";
import { remoteServerJwt } from "@/lib/storage";
import { onLoginButtonClick } from "@/logic/loginButton";
import {
  accountBalanceQueryKey,
  accountQueryKey,
  useAccountBalanceQuery,
  useAccountQuery,
} from "@/queries";
import { useQueryClient } from "@tanstack/vue-query";
import { shell } from "@tauri-apps/api";
import {
  CircleDollarSignIcon,
  ExternalLinkIcon,
  Loader2Icon,
  LogOutIcon,
  MailIcon,
  User2Icon,
} from "lucide-vue-next";
import { computed, ref } from "vue";

const accountQuery = useAccountQuery();
const accountBalanceQuery = useAccountBalanceQuery();

const queryClient = useQueryClient();
const patreon = computed(() => accountQuery.data.value?.oAuthAccounts.patreon);
const loginInProgress = ref(false);

async function login() {
  await onLoginButtonClick(loginInProgress, false, true);
  await queryClient.invalidateQueries({ queryKey: accountQueryKey() });
  await queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });
}

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

  await queryClient.invalidateQueries({ queryKey: accountQueryKey() });
  await queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() });
}

// TODO: Make it display the progress.
async function linkPatreon() {
  const { url } = await api.v1.auth.oauth.create("patreon", "link");
  await shell.open(url);
}

async function gotoPatreonCampaign() {
  console.log(
    "Opening Patreon campaign URL",
    import.meta.env.VITE_PATREON_CAMPAIGN_URL,
  );

  await shell.open(import.meta.env.VITE_PATREON_CAMPAIGN_URL);
}
</script>

<template lang="pug">
.flex.flex-col
  RichTitle.border-b.p-3(title="Account")
    template(#icon)
      User2Icon(:size="20")
    template(#extra)
      button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
        v-if="accountQuery.data.value"
        @click="logout"
        title="Log out"
        class="hover:btn-error"
      )
        LogOutIcon(:size="18")

  .flex.w-full.flex-col.p-3(v-if="accountQuery.data.value")
    RichTitle(title="E-mail")
      template(#icon)
        MailIcon(:size="20")
      template(#extra)
        Loader2Icon.animate-spin(
          :size="20"
          v-if="accountQuery.isLoading.value"
        )
        .font-mono(v-else) {{ accountQuery.data.value?.email }}

    RichTitle(title="Credits")
      template(#icon)
        CircleDollarSignIcon(:size="20")
      template(#extra)
        Loader2Icon.animate-spin(
          :size="20"
          v-if="accountBalanceQuery.isLoading.value"
        )
        .font-mono(v-else) ¢{{ accountBalanceQuery.data.value?.credit ?? 0 }}

    RichTitle(title="Patreon")
      template(#icon)
        img.h-5(src="/img/patreon.svg" alt="Patreon")
      template(#extra)
        .flex.flex-col.items-end(v-if="patreon")
          span(v-if="patreon.tier")
            span.font-semibold {{ patreon.tier.name }}
            | &nbsp;until {{ patreon.tier.activeUntil.toLocaleDateString() }}
          button.btn.link.gap-1(v-else @click="gotoPatreonCampaign")
            | See tiers
            ExternalLinkIcon(:size="16")
        button.link(v-else @click="linkPatreon") Link

  .flex.h-full.flex-col.items-center.justify-center(v-else)
    button.btn.btn-primary.btn-md.rounded-lg(
      @click="login"
      :disabled="loginInProgress"
    ) Log in
</template>
