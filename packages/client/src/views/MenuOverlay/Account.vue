<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import * as api from "@/lib/api";
import { confirm_ } from "@/lib/resources";
import * as storage from "@/lib/storage";
import { sleep } from "@/lib/utils";
import {
  accountBalanceQueryKey,
  accountQueryKey,
  useAccountBalanceQuery,
  useAccountQuery,
} from "@/queries";
import { useQueryClient } from "@tanstack/vue-query";
import { shell } from "@tauri-apps/api";
import { toMilliseconds } from "duration-fns";
import {
  CircleDollarSignIcon,
  ExternalLinkIcon,
  Loader2Icon,
  LogOutIcon,
  MailIcon,
  User2Icon,
} from "lucide-vue-next";
import { nanoid } from "nanoid";
import { computed, ref } from "vue";
import { toast } from "vue3-toastify";

const LOGIN_TIMEOUT = toMilliseconds({ minutes: 5 });

const accountQuery = useAccountQuery();
const accountBalanceQuery = useAccountBalanceQuery();

const queryClient = useQueryClient();
const patreon = computed(() => accountQuery.data.value?.oAuthAccounts.patreon);
const loginInProgress = ref(false);

async function login() {
  try {
    loginInProgress.value = true;

    const nonce = nanoid();
    const url = import.meta.env.VITE_WEB_BASE_URL + "/login?nonce=" + nonce;
    console.log("Opening login page", url);
    await shell.open(url);

    const start = Date.now();
    while (true) {
      const response = await api.trpc.commandsClient.auth.nonce.check.query({
        nonce,
      });

      if (!response) {
        console.log("Still waiting for login...");

        if (Date.now() - start > LOGIN_TIMEOUT) {
          throw new Error("Login timed out");
        }

        await sleep(1000);
        continue;
      }

      console.log("Logged in", response);

      toast("Successfully logged in", {
        theme: "auto",
        type: "success",
        position: "bottom-right",
        pauseOnHover: false,
      });

      storage.user.save(response.userId, response.cookieMaxAge);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountQueryKey() }),
        queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() }),
      ]);

      break;
    }
  } finally {
    loginInProgress.value = false;
  }
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

  await api.trpc.commandsClient.auth.delete.mutate();
  storage.user.clear();

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: accountQueryKey() }),
    queryClient.invalidateQueries({ queryKey: accountBalanceQueryKey() }),
  ]);
}

// TODO: Make it display the progress.
async function linkPatreon() {
  const { url } = await api.trpc.commandsClient.auth.oauth.create.mutate({
    providerId: "patreon",
    reason: "link",
  });

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

  .flex.w-full.flex-col.p-3(
    v-if="storage.user.id.value && accountQuery.data.value"
  )
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
            | &nbsp;until {{ new Date(patreon.tier.activeUntil).toLocaleDateString() }}
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
