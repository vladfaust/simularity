import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";
import { OAuthProviderIdSchema } from "@simularity/api/lib/schema";
import { userId } from "./store";

import Account from "./views/Account.vue";
import Home from "./views/Home.vue";
import Login from "./views/Login.vue";
import OAuthCallback from "./views/OAuthCallback.vue";
import { v } from "./lib/valibot";

export type RouteName = "Account" | "Home" | "Login" | "OAuthCallback";

export function routeLocation(
  args:
    | { name: "Account" }
    | { name: "Home" }
    | { name: "Login" }
    | {
        name: "OAuthCallback";
        params: { providerId: v.InferInput<typeof OAuthProviderIdSchema> };
      },
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
    path: "/account",
    name: "Account" satisfies RouteName,
    component: Account,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/login",
    name: "Login" satisfies RouteName,
    component: Login,
  },
  {
    path: "/oauth/:providerId/:reason",
    name: "OAuthCallback" satisfies RouteName,
    component: OAuthCallback,
    props: true,
  },
];

const router = createRouter({
  // Use: createWebHistory(process.env.BASE_URL) in your app
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.redirectIfAuthed && userId.value) {
    return routeLocation({ name: "Home" });
  } else if (to.meta.requiresAuth && !userId.value) {
    return routeLocation({ name: "Login" });
  }
});

export default router;
