<script setup lang="ts">
import * as api from "@/lib/api";
import { saveUser } from "@/store";
import * as v from "valibot";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import Alert from "../Alert.vue";

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
    await api.trpc.commandsClient.auth.email.sendCode.mutate({
      email: email.value,
      nonce,
    });

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
    const response =
      await api.trpc.commandsClient.auth.email.loginWithCode.mutate({
        email: email.value,
        code,
      });

    saveUser(response.userId, response.cookieMaxAge);
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
  Alert.gap-2.p-3(v-if="error" kind="error") {{ error }}
  Alert.gap-2.p-3(v-else-if="codeSent" kind="info")
    i18n-t.leading-snug(keypath="login.email.codeSent" tag="p")
      template(#email)
        span.font-medium {{ email }}

  input.rounded-lg.border.p-2.shadow-inner(
    v-if="!codeSent"
    type="email"
    :placeholder="t('login.email.placeholder')"
    v-model="email"
    @keydown.enter="sendCode"
    :disabled="codeSent"
  )

  button.btn.btn-primary.btn-lg.btn-pressable.rounded-lg(
    v-if="!codeSent"
    @click="sendCode"
    :disabled="!email"
  ) {{ t("login.email.sendCode") }}

  template(v-if="codeSent")
    input.rounded-lg.border.p-2.shadow-inner(
      type="text"
      :placeholder="t('login.email.codePlaceholder')"
      v-model="code"
      maxlength="6"
      minlength="6"
      @keydown.enter="login(code)"
    )

    button.btn.btn-primary.btn-lg.rounded-lg(
      @click="login(code)"
      :disabled="!codeValid"
    ) {{ t("login.email.logIn") }}

    button.btn.btn-md.btn-neutral.rounded-lg(
      @click="email = ''; code = ''; error = ''; codeSent = false; emit('cancel')"
    )
      span.text-sm {{ t("login.email.cancel") }}
</template>
