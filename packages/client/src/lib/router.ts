import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";
import GameScreen from "../screens/GameScreen.vue";
import LoadGame from "../screens/LoadGame.vue";
import MainMenu from "../screens/MainMenuScreen.vue";

export type RouteName = "MainMenu" | "LoadGame" | "Game" | "GnbfTester";

export function routeLocation(
  args:
    | { name: "MainMenu" }
    | { name: "LoadGame" }
    | { name: "Game"; params: { gameId: string } }
    | { name: "GnbfTester" },
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
    path: "/load",
    name: "LoadGame" satisfies RouteName,
    component: LoadGame,
  },
  {
    path: "/games/:gameId",
    name: "Game" satisfies RouteName,
    component: GameScreen,
    props: true,
  },
  {
    path: "/gnbf-tester",
    name: "GnbfTester" satisfies RouteName,
    component: () => import("../screens/GnbfTester.vue"),
    props: true,
  },
];

const router = createRouter({
  // Use: createWebHistory(process.env.BASE_URL) in your app
  history: createWebHistory(),
  routes,
});

export default router;
