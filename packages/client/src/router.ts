import {
  createRouter,
  createWebHistory,
  type RouteLocationNamedRaw,
  type RouteRecordRaw,
} from "vue-router";
import Library from "./views/Library.vue";
import Scenario from "./views/Scenario.vue";
import Shutdown from "./views/Shutdown.vue";
import Simulation from "./views/Simulation.vue";
import User from "./views/User.vue";

export type RouteName =
  | "Home"
  | "Library"
  | "Scenario"
  | "Simulation"
  | "User"
  | "Shutdown";

export function routeLocation(
  args:
    | { name: "Home" }
    | { name: "Library" }
    | { name: "Scenario"; params: { scenarioId: string } }
    | { name: "Simulation"; params: { simulationId: number } }
    | { name: "User" }
    | { name: "Shutdown" },
): RouteLocationNamedRaw & { name: RouteName } {
  return args;
}

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Home" satisfies RouteName,
    alias: "/home",
    redirect: "/library",
  },
  {
    path: "/library",
    children: [
      {
        path: "",
        name: "Library" satisfies RouteName,
        component: Library,
      },
      {
        path: ":scenarioId",
        name: "Scenario" satisfies RouteName,
        component: Scenario,
        props: true,
      },
    ],
  },
  {
    path: "/simulations/:simulationId",
    name: "Simulation" satisfies RouteName,
    component: Simulation,
    props: true,
  },
  {
    path: "/user",
    name: "User" satisfies RouteName,
    component: User,
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
