import { OAuthProviderIdSchema } from "@simularity/api/lib/schema";
import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";
import { v } from "./lib/valibot";
import { userId } from "./store";

import Account from "./views/Account.vue";
import Home from "./views/Home.vue";
import Login from "./views/Login.vue";
import OAuthCallback from "./views/OAuthCallback.vue";
import Pricing from "./views/Pricing.vue";
import Scenario from "./views/Scenario.vue";

export type RouteName =
  | "Account"
  | "Home"
  | "Scenario"
  | "Login"
  | "Pricing"
  | "OAuthCallback";

export function routeLocation(
  args:
    | { name: "Account" }
    | { name: "Home" }
    | { name: "Scenario"; params: { scenarioId: string } }
    | { name: "Login" }
    | { name: "Pricing" }
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
    path: "/pricing",
    name: "Pricing" satisfies RouteName,
    component: Pricing,
  },
  {
    path: "/scenarios/:scenarioId",
    name: "Scenario" satisfies RouteName,
    component: Scenario,
    props: true,
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
