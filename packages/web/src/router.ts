import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";

import Home from "./views/Home.vue";
import Login from "./views/Login.vue";
import { jwt } from "./store";

export type RouteName = "Home" | "Login";

export function routeLocation(
  args: { name: "Home" } | { name: "Login" },
): RouteLocationNamedRaw & { name: RouteName } {
  return args;
}

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home" satisfies RouteName,
    component: Home,
  },
  {
    path: "/login",
    name: "Login" satisfies RouteName,
    component: Login,
  },
];

const router = createRouter({
  // Use: createWebHistory(process.env.BASE_URL) in your app
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.redirectIfAuthed && jwt.value) {
    return routeLocation({ name: "Home" });
  }
});

export default router;
