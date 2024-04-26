import { invoke } from "@tauri-apps/api";
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

invoke("greet", { name: "Tauri" }).then((response) => console.log(response));

createApp(App).mount("#app");
