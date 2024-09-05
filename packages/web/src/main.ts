import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import router from "./router";
import "./style.scss";

const i18n = createI18n({
  legacy: false,
  fallbackWarn: false,
  missingWarn: false,
});

const app = createApp(App);

app.use(router);
app.use(i18n);
app.use(VueQueryPlugin);

router.isReady().then(() => {
  app.mount("#app");
});
