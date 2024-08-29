<script setup lang="ts">
import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import { sleep } from "@/lib/utils";
import router, { routeLocation } from "@/router";
import * as shell from "@tauri-apps/api/shell";
import { toMilliseconds } from "duration-fns";
import { LibraryBigIcon, Loader2Icon, UserCircle2Icon } from "lucide-vue-next";
import { nanoid } from "nanoid";
import { ref } from "vue";
import { toast } from "vue3-toastify";

const LOGIN_TIMEOUT = toMilliseconds({ minutes: 5 });
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
      try {
        const response = await api.v1.auth.get(
          import.meta.env.VITE_API_BASE_URL,
          nonce,
        );

        storage.remoteServerJwt.value = response.jwt;
        console.log("Logged in", response.jwt);

        router.push(routeLocation({ name: "User" })).then(() => {
          toast("Successfully logged in", {
            theme: "auto",
            type: "success",
            position: "bottom-right",
            pauseOnHover: false,
          });
        });

        break;
      } catch (e: any) {
        if (e instanceof api.RemoteApiError && e.response.status === 401) {
          console.log("Still waiting for login...");
          if (Date.now() - start > LOGIN_TIMEOUT) {
            throw new Error("Login timed out");
          }
          await sleep(1000);
        } else {
          throw e;
        }
      }
    }
  } finally {
    loginInProgress.value = false;
  }
}
</script>

<template lang="pug">
.flex.h-full.justify-between.px-3
  .flex
    //- RouterLink._header-link(:to="routeLocation({ name: 'Home' })")
    //-   HomeIcon(:size="20")
    //-   span Home

    RouterLink._header-link(:to="routeLocation({ name: 'Library' })")
      LibraryBigIcon(:size="20")
      span Library

  .flex.items-center.py-3
    RouterLink(
      v-if="storage.remoteServerJwt.value"
      :to="routeLocation({ name: 'User' })"
    )
      span Logged in

    button.btn.btn-md.h-max.rounded-lg.border.px-3.py-1.tracking-wide.transition-transform.pressable(
      v-else
      @click="login"
      :disabled="loginInProgress"
    )
      Loader2Icon.animate-spin(
        v-if="loginInProgress"
        :size="18"
        :stroke-width="2.5"
      )
      UserCircle2Icon(v-else :size="18" :stroke-width="2.5")
      span Log in
</template>

<style lang="scss" scoped>
._header-link {
  @apply flex h-full items-center gap-1 border-y-4 border-t-transparent p-3 font-semibold tracking-wide;

  &.router-link-active {
    @apply border-b-primary-500;
  }

  &.router-link-exact-active,
  &:hover {
    @apply border-b-primary-500 text-primary-500;
  }
}
</style>
