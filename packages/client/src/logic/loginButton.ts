import * as api from "@/lib/api";
import * as storage from "@/lib/storage";
import { sleep } from "@/lib/utils";
import router, { routeLocation } from "@/router";
import { shell } from "@tauri-apps/api";
import { toMilliseconds } from "duration-fns";
import { nanoid } from "nanoid";
import type { Ref } from "vue";
import { toast } from "vue3-toastify";

const LOGIN_TIMEOUT = toMilliseconds({ minutes: 5 });

export async function onLoginButtonClick(
  loginInProgress: Ref<boolean>,
  redirectOnLogin: boolean,
  showToast: boolean,
) {
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

        function maybeShowToast() {
          if (showToast) {
            toast("Successfully logged in", {
              theme: "auto",
              type: "success",
              position: "bottom-right",
              pauseOnHover: false,
            });
          }
        }

        if (redirectOnLogin) {
          router.push(routeLocation({ name: "User" })).then(maybeShowToast);
        } else {
          maybeShowToast();
        }

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
