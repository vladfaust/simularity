import * as Sentry from "@sentry/vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { getMatches } from "@tauri-apps/plugin-cli";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import { createApp, watch } from "vue";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import { env } from "./env";
import { downloadManager } from "./lib/downloads";
import { migrate } from "./lib/drizzle";
import { appLocale } from "./lib/storage";
import { Deferred } from "./lib/utils";
import { SUPPORTED_LOCALES } from "./logic/i18n";
import router from "./router";
import "./style.scss";

const migrated = new Deferred<void>();
getMatches().then((matches) => {
  let toIndex: number | undefined;
  if ("migrate" in matches.args && matches.args.migrate.occurrences) {
    console.debug(matches.args.migrate);
    if (typeof matches.args.migrate.value !== "string") {
      throw new Error("migrate argument must be a single number");
    }

    toIndex = parseInt(matches.args.migrate.value);
  }

  (toIndex === undefined ? migrate() : migrate(toIndex)).then(
    (migrationsRun) => {
      console.log(`Applied ${migrationsRun} migrations.`);
      migrated.resolve();
    },
  );
});

const app = createApp(App);

Sentry.init({
  app,
  dsn: env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration({ router })],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for tracing.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
  tracePropagationTargets: ["localhost"],
});

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

// Once the app language changes, update the i18n locale.
watch(
  () => appLocale.value,
  (locale) => (i18n.global.locale.value = locale.toString()),
);

app.use(router);
app.use(VueQueryPlugin);
app.use(FloatingVue);
app.use(i18n);

router.isReady().then(async () => {
  await migrated.promise;
  downloadManager.init();
  app.mount("#app");
});
