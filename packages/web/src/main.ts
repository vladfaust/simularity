import { VueQueryPlugin } from "@tanstack/vue-query";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import { SUPPORTED_LOCALES } from "./lib/logic/i18n";
import router from "./router";
import { appLocale } from "./store";
import "./style.scss";

const i18n = createI18n({
  legacy: false,
  locale: appLocale.value.toString(),
  fallbackWarn: false,
  missingWarn: false,
  availableLocales: Object.keys(SUPPORTED_LOCALES),

  pluralRules: {
    /**
     * @example `car: "0 машин | {n} машина | {n} машины | {n} машин"`
     */
    // FIXME: "1000 символа".
    ru: (choice, choicesLength, _) => {
      if (choice === 0) {
        return 0;
      }

      const teen = choice > 10 && choice < 20;
      const endsWithOne = choice % 10 === 1;

      if (!teen && endsWithOne) {
        return 1;
      }

      if (!teen && choice % 10 >= 2 && choice % 10 <= 4) {
        return 2;
      }

      return choicesLength < 4 ? 2 : 3;
    },
  },
});

const app = createApp(App);

app.use(router);
app.use(i18n);
app.use(VueQueryPlugin);
app.use(FloatingVue);

router.isReady().then(() => {
  app.mount("#app");
});
