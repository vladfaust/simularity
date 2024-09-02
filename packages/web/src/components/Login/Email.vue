<script setup lang="ts">
import * as api from "@/lib/api";
import { jwt } from "@/store";
import * as v from "valibot";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

const route = useRoute();

const emit = defineEmits<{
  (event: "sendCode", email: string): void;
  (event: "cancel"): void;
  (event: "login", justCreated: boolean): void;
}>();

const CodeSchema = v.pipe(
  v.string(),
  v.regex(/^\d{6}$/, "Code must be six digits"),
);

const nonce = route.query.nonce as string | undefined;
const email = ref("");
const code = ref("");
const inProgress = ref(false);

const codeSent = ref(false);
const codeValid = computed(() => v.safeParse(CodeSchema, code.value).success);
const error = ref<string | null>(null);

async function sendCode() {
  inProgress.value = true;

  try {
    await api.auth.email.sendCode(email.value, nonce);
    codeSent.value = true;
    emit("sendCode", email.value);
  } finally {
    inProgress.value = false;
  }
}

async function login(code: string) {
  if (!codeValid.value) return;
  inProgress.value = true;

  try {
    const response = await api.auth.email.loginWithCode(email.value, code);
    jwt.value = response.jwt;
    emit("login", false);
  } catch (e: any) {
    error.value = e.message;
    throw e;
  } finally {
    inProgress.value = false;
  }
}

const { t } = useI18n({
  messages: {
    en: {
      login: {
        email: {
          placeholder: "Your e-mail",
          sendCode: "Send code to email",
          codeSent:
            "We've sent a six-digit code to {email}. Please enter it below.",
          codePlaceholder: "Six-digit code",
          logIn: "Log In",
          cancel: "Cancel",
        },
      },
    },
  },
});
</script>

<template lang="pug">
.flex.flex-col
  .dz-alert.dz-alert-error(v-if="error") {{ error }}
  .dz-alert.dz-alert-info(v-else-if="codeSent")
    i18n-t(keypath="login.email.codeSent" tag="p")
      template(#email)
        span.font-medium {{ email }}

  input.dz-input.dz-input-md.dz-input-bordered(
    v-if="!codeSent"
    type="email"
    :placeholder="t('login.email.placeholder')"
    v-model="email"
    @keydown.enter="sendCode"
    :disabled="codeSent"
  )

  button.dz-btn.dz-btn-primary.dz-btn-md(
    v-if="!codeSent"
    @click="sendCode"
    :disabled="!email"
  ) {{ t("login.email.sendCode") }}

  template(v-if="codeSent")
    input.dz-input.dz-input-md.dz-input-bordered(
      type="text"
      :placeholder="t('login.email.codePlaceholder')"
      v-model="code"
      maxlength="6"
      minlength="6"
      @keydown.enter="login(code)"
    )

    button.dz-btn.dz-btn-md.dz-btn-primary(
      @click="login(code)"
      :disabled="!codeValid"
    ) {{ t("login.email.logIn") }}

    button.dz-btn.dz-btn-sm.dz-btn-base(
      @click="email = ''; code = ''; codeSent = false; emit('cancel')"
    )
      span.text-sm {{ t("login.email.cancel") }}
</template>
