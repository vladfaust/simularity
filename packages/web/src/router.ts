import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";

import Home from "./components/Home.vue";
import Login from "./components/Login.vue";
import Register from "./components/Register.vue";
import { jwt } from "./store";

export type RouteName = "Home" | "Login" | "Register";

export function routeLocation(
  args: { name: "Home" } | { name: "Login" } | { name: "Register" },
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
  {
    path: "/register",
    name: "Register" satisfies RouteName,
    component: Register,
    meta: { redirectIfAuthed: true },
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
