import { getMatches } from "@tauri-apps/api/cli";
import { createApp } from "vue";
import App from "./App.vue";
import { migrate } from "./lib/drizzle";
import router from "./lib/router";
import "./style.scss";

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
    },
  );
});

const app = createApp(App);

app.use(router);

router.isReady().then(() => {
  app.mount("#app");
});
