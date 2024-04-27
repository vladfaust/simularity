import { createApp } from "vue";
import App from "./App.vue";
import router from "./lib/router";
import "./style.scss";

const app = createApp(App);

app.use(router);

router.isReady().then(() => {
  app.mount("#app");
});
