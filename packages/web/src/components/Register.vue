<script setup lang="ts">
import { createUser } from "@/lib/api";
import { jwt } from "@/store";
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const username = ref("");
const password = ref("");
const agreedToTerms = ref(false);
const error = ref<string | null>(null);

const registerInProgress = ref(false);
async function onRegisterButtonClick() {
  try {
    registerInProgress.value = true;
    error.value = null;
    const response = await createUser(username.value, password.value);
    jwt.value = response.jwt;
    router.push({ name: "Home" });
  } catch (e: any) {
    error.value = e.message;
  } finally {
    registerInProgress.value = false;
  }
}
</script>

<template lang="pug">
.flex.h-screen.flex-col.items-center.justify-center.p-3
  .flex.w-full.max-w-sm.flex-col.items-center.gap-2.rounded-lg.border.p-2
    h1.text-lg.font-medium Register

    //- Username input.
    input.w-full.rounded.border.bg-slate-200.p-2(
      v-model="username"
      placeholder="Username"
    )

    //- Password input.
    input.w-full.rounded.border.bg-slate-200.p-2(
      v-model="password"
      placeholder="Password"
      type="password"
    )

    //- Agreement checkbox.
    .flex.gap-1
      input#agreedToTerms(type="checkbox" v-model="agreedToTerms")
      label(for="agreedToTerms") I agree to the terms and conditions.

    p.text-red-500(v-if="error") {{ error }}
    button.btn.btn-primary.btn-md.rounded(
      :disabled="registerInProgress || !username || !password || !agreedToTerms"
      @click="onRegisterButtonClick"
    ) Register
    p.text-sm
      | Already have an account?
      |
      RouterLink.link(:to="{ name: 'Login' }") Login
      | .
</template>
