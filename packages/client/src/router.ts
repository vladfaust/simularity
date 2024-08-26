import {
  createRouter,
  createWebHistory,
  type RouteLocationNamedRaw,
  type RouteRecordRaw,
} from "vue-router";
import ChooseScenario from "./views/ChooseScenario.vue";
import LoadSimulations from "./views/LoadSimulations.vue";
import MainMenu from "./views/MainMenu.vue";
import NewGame from "./views/NewGame.vue";
import Shutdown from "./views/Shutdown.vue";
import Simulation from "./views/Simulation.vue";

export type RouteName =
  | "MainMenu"
  | "ChooseScenario"
  | "NewGame"
  | "LoadSimulations"
  | "Simulation"
  | "Shutdown";

export function routeLocation(
  args:
    | { name: "MainMenu" }
    | { name: "ChooseScenario" }
    | { name: "NewGame"; params: { scenarioId: string } }
    | { name: "LoadSimulations" }
    | { name: "Simulation"; params: { simulationId: string } }
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
    path: "/choose-scenario",
    name: "ChooseScenario" satisfies RouteName,
    component: ChooseScenario,
  },
  {
    path: "/new-game/:scenarioId",
    name: "NewGame" satisfies RouteName,
    component: NewGame,
    props: true,
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
