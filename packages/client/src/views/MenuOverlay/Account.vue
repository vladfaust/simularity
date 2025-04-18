<script setup lang="ts">
import SubscriptionIcon from "@/components/Icons/SubscriptionIcon.vue";
import RichTitle from "@/components/RichForm/RichTitle.vue";
import { env } from "@/env";
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
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import WrapBalancer from "vue-wrap-balancer";
import { toast } from "vue3-toastify";

const LOGIN_TIMEOUT = toMilliseconds({ minutes: 5 });

const accountQuery = useAccountQuery();
const queryClient = useQueryClient();
const loginInProgress = ref(false);

async function login() {
  try {
    loginInProgress.value = true;

    const nonce = nanoid();
    const url = env.VITE_WEB_BASE_URL + "/login?nonce=" + nonce;
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
}

async function onSubscribeButtonClick() {
  const url = env.VITE_WEB_BASE_URL + "/pricing";
  console.log("Opening subscription page", url);
  await tauriShell.open(url);
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
          subscription: {
            label: "Subscription",
            none: "None",
            subscribeButtonLabel: "Subscribe",
            tiers: {
              basic: "Basic",
              premium: "Premium",
            },
            activeUntil: "until {date}",
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
          subscription: {
            label: "Подписка",
            none: "Нет",
            subscribeButtonLabel: "Подписаться",
            tiers: {
              basic: "Базовая",
              premium: "Премиум",
            },
            activeUntil: "до {date}",
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

  //- When logged in.
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

    RichTitle(:title="t('menuOverlay.account.subscription.label')")
      template(#icon)
        SubscriptionIcon(:size="20")
      template(#extra)
        //- When subscription is active.
        span(v-if="accountQuery.data.value.subscription")
          span(
            :class="{ 'text-blue-500': accountQuery.data.value.subscription.tier === 'basic', 'text-purple-500': accountQuery.data.value.subscription.tier === 'premium' }"
          ) {{ t(`menuOverlay.account.subscription.tiers.${accountQuery.data.value.subscription.tier}`) }}&nbsp;
          span ({{ t("menuOverlay.account.subscription.activeUntil", { date: new Date(accountQuery.data.value.subscription.activeUntil).toLocaleDateString() }) }})

        //- When no subscription.
        button.link.flex.items-center.gap-1(
          v-else
          @click="onSubscribeButtonClick"
        )
          | {{ t("menuOverlay.account.subscription.subscribeButtonLabel") }}
          ExternalLinkIcon.inline-block(:size="16")

  //- When not logged in.
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
