import { VueQueryPlugin } from "@tanstack/vue-query";
import { getMatches } from "@tauri-apps/api/cli";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import { createApp } from "vue";
import App from "./App.vue";
import { downloadManager } from "./lib/downloads";
import { migrate } from "./lib/drizzle";
import { Deferred } from "./lib/utils";
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

app.use(router);
app.use(VueQueryPlugin);
app.use(FloatingVue);

router.isReady().then(async () => {
  await migrated.promise;
  downloadManager.init();
  app.mount("#app");
});
