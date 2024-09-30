import {
  createRouter,
  createWebHistory,
  type RouteLocationNamedRaw,
  type RouteRecordRaw,
} from "vue-router";
import Shutdown from "./views/Shutdown.vue";
import Simulation from "./views/Simulation.vue";

export type RouteName = "Home" | "Simulation" | "Shutdown";

export function routeLocation(
  args:
    | { name: "Home" }
    | { name: "Simulation"; params: { simulationId: number } }
    | { name: "Shutdown" },
): RouteLocationNamedRaw & { name: RouteName } {
  return args;
}

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home" satisfies RouteName,
    component: () => import("./views/Home.vue"),
  },
  {
    path: "/simulations/:simulationId",
    name: "Simulation" satisfies RouteName,
    component: Simulation,
    props: true,
  },
  {
    path: "/quit",
    name: "Shutdown" satisfies RouteName,
    component: () => Shutdown,
  },
];

const router = createRouter({
  // Use: createWebHistory(process.env.BASE_URL) in your app
  history: createWebHistory(),
  routes,
});

export default router;
