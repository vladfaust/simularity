import {
  RouteLocationNamedRaw,
  RouteRecordRaw,
  createRouter,
  createWebHistory,
} from "vue-router";
import GameScreen from "../screens/GameScreen.vue";
import MainMenu from "../screens/MainMenuScreen.vue";

export type RouteName = "MainMenu" | "Game";

export function routeLocation(
  args: { name: "MainMenu" } | { name: "Game"; params: { gameId: string } },
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
    path: "/games/:gameId",
    name: "Game" satisfies RouteName,
    component: GameScreen,
    props: true,
  },
];

const router = createRouter({
  // Use: createWebHistory(process.env.BASE_URL) in your app
  history: createWebHistory(),
  routes,
});

export default router;
