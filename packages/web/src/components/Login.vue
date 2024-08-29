<script setup lang="ts">
import { authorizeNonce, createAuth } from "@/lib/api";
import { routeLocation } from "@/router";
import { jwt } from "@/store";
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");

const error = ref<string | null>(null);
const nonce = route.query.nonce as string | undefined;

const loginInProgress = ref(false);
async function login() {
  try {
    loginInProgress.value = true;
    error.value = null;
    const response = await createAuth(username.value, password.value, nonce);
    jwt.value = response.jwt;
    router.push({ name: "Home" });
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loginInProgress.value = false;
  }
}

onMounted(async () => {
  if (jwt.value) {
    console.log("Already logged in");

    if (nonce) {
      console.log("Authorizing a nonce", nonce);
      await authorizeNonce(nonce);
    }

    await router.push(routeLocation({ name: "Home" }));
  }
});
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.justify-center.p-3
  .flex.w-full.max-w-sm.flex-col.items-center.gap-2.rounded-lg.border.p-2
    h1.text-lg.font-medium Login
    input.w-full.rounded.border.bg-slate-200.p-2(
      v-model="username"
      placeholder="Username"
    )
    input.w-full.rounded.border.bg-slate-200.p-2(
      v-model="password"
      placeholder="Password"
      type="password"
    )
    p.text-red-500(v-if="error") {{ error }}
    button.btn.btn-primary.btn-md.rounded(
      :disabled="loginInProgress || !username || !password"
      @click="login"
    ) Login
    p.text-sm
      | Don't have an account?
      |
      RouterLink.link(:to="{ name: 'Register' }") Register
      | .
</template>
