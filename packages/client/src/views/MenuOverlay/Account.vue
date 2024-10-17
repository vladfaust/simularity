<script setup lang="ts">
import RichTitle from "@/components/RichForm/RichTitle.vue";
import * as api from "@/lib/api";
import { confirm_ } from "@/lib/resources";
import * as storage from "@/lib/storage";
import { sleep } from "@/lib/utils";
import { accountQueryKey, useAccountQuery } from "@/queries";
import { useQueryClient } from "@tanstack/vue-query";
import * as tauriShell from "@tauri-apps/plugin-shell";
import { toMilliseconds } from "duration-fns";
import {
  ExternalLinkIcon,
  Loader2Icon,
  LogInIcon,
  LogOutIcon,
  MailIcon,
  User2Icon,
} from "lucide-vue-next";
import { nanoid } from "nanoid";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import WrapBalancer from "vue-wrap-balancer";
import { toast } from "vue3-toastify";

const LOGIN_TIMEOUT = toMilliseconds({ minutes: 5 });

const accountQuery = useAccountQuery();
const queryClient = useQueryClient();
const patreon = computed(() => accountQuery.data.value?.oAuthAccounts.patreon);
const loginInProgress = ref(false);

async function login() {
  try {
    loginInProgress.value = true;

    const nonce = nanoid();
    const url = import.meta.env.VITE_WEB_BASE_URL + "/login?nonce=" + nonce;
    console.log("Opening login page", url);
    await tauriShell.open(url);

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

      toast(t("menuOverlay.account.toastSuccess"), {
        theme: "auto",
        type: "success",
        position: "bottom-right",
        pauseOnHover: false,
      });

      storage.user.save(response.userId, response.jwt, response.cookieMaxAge);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountQueryKey() }),
      ]);

      api.trpc.recreateSubscriptionsClient();

      break;
    }
  } finally {
    loginInProgress.value = false;
  }
}

async function logout() {
  if (
    !(await confirm_(t("menuOverlay.account.logoutConfirmation.message"), {
      title: t("menuOverlay.account.logoutConfirmation.title"),
      okLabel: t("menuOverlay.account.logoutConfirmation.okLabel"),
      cancelLabel: t("menuOverlay.account.logoutConfirmation.cancelLabel"),
    }))
  ) {
    return;
  }

  await api.trpc.commandsClient.auth.delete.mutate();
  storage.user.clear();

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: accountQueryKey() }),
  ]);

  api.trpc.recreateSubscriptionsClient();
}

// TODO: Make it display the progress.
async function linkPatreon() {
  const { url } = await api.trpc.commandsClient.auth.oauth.create.mutate({
    providerId: "patreon",
    reason: "link",
  });

  await tauriShell.open(url);
}

async function gotoPatreonCampaign() {
  console.log(
    "Opening Patreon campaign URL",
    import.meta.env.VITE_PATREON_CAMPAIGN_URL,
  );

  await tauriShell.open(import.meta.env.VITE_PATREON_CAMPAIGN_URL);
}

const { t } = useI18n({
  messages: {
    "en-US": {
      menuOverlay: {
        account: {
          title: "Account",
          loginText:
            "Log into Simularity to get access to premium scenarios and unlimited cloud inference.",
          loginButton: "Log in",
          loginButtonWaiting: "Waiting for login...",
          browserHint: "Login page will open in your browser.",
          toastSuccess: "Successfully logged in",
          logoutConfirmation: {
            message: "Are you sure you want to log out?",
            title: "Logging out",
            okLabel: "Log out",
            cancelLabel: "Cancel",
          },
        },
      },
    },
    "ru-RU": {
      menuOverlay: {
        account: {
          title: "Аккаунт",
          loginText:
            "Войдите в Simularity, чтобы получить доступ к премиум сценариям и безлимитному инференсу в облаке.",
          loginButton: "Войти",
          loginButtonWaiting: "Ожидание входа...",
          browserHint: "Страница входа откроется в вашем браузере.",
          toastSuccess: "Вход выполнен успешно",
          logoutConfirmation: {
            message: "Вы уверены, что хотите выйти из аккаунта?",
            title: "Выход",
            okLabel: "Выйти",
            cancelLabel: "Отмена",
          },
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  RichTitle.border-b.p-3(:title="t('menuOverlay.account.title')")
    template(#icon)
      User2Icon(:size="20")
    template(#extra)
      button.btn-pressable.btn.btn-sm-square.rounded-lg.border(
        v-if="storage.user.id.value"
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

  .flex.h-full.flex-col.items-center.justify-center.gap-2.p-3(v-else)
    WrapBalancer.text-center(tag="p") {{ t("menuOverlay.account.loginText") }}
    button.btn.btn-primary.btn-md.btn-pressable.rounded-lg(
      @click="login"
      :disabled="loginInProgress"
    )
      template(v-if="loginInProgress")
        Loader2Icon.animate-spin(:size="20")
        | {{ t("menuOverlay.account.loginButtonWaiting") }}
      template(v-else)
        LogInIcon(:size="20")
        | {{ t("menuOverlay.account.loginButton") }} *
    span.text-sm.italic.opacity-50 * {{ t("menuOverlay.account.browserHint") }}
</template>
