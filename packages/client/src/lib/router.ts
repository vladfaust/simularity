import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";
import LoadSimulations from "../screens/LoadSimulations.vue";
import MainMenu from "../screens/MainMenuScreen.vue";
import Settings from "../screens/Settings.vue";
import Shutdown from "../screens/Shutdown.vue";
import Simulation from "../screens/Simulation.vue";

export type RouteName =
  | "MainMenu"
  | "Settings"
  | "LoadSimulations"
  | "Simulation"
  | "GnbfTester"
  | "Shutdown";

export function routeLocation(
  args:
    | { name: "MainMenu" }
    | { name: "Settings" }
    | { name: "LoadSimulations" }
    | { name: "Simulation"; params: { simulationId: string } }
    | { name: "GnbfTester" }
    | { name: "Shutdown" },
): RouteLocationNamedRaw & { name: RouteName } {
  return args;
}

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "MainMenu" satisfies RouteName,
    component: MainMenu,
  },
  {
    path: "/settings",
    name: "Settings" satisfies RouteName,
    component: Settings,
  },
  {
    path: "/simulations/load",
    name: "LoadSimulations" satisfies RouteName,
    component: LoadSimulations,
  },
  {
    path: "/simulations/:simulationId",
    name: "Simulation" satisfies RouteName,
    component: Simulation,
    props: true,
  },
  {
    path: "/gnbf-tester",
    name: "GnbfTester" satisfies RouteName,
    component: () => import("../screens/GnbfTester.vue"),
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
