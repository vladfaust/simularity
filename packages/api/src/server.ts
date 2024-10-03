import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import * as trpcWs from "@trpc/server/adapters/ws";
import cookieParser from "cookie-parser";
import cors from "cors";
import Express from "express";
import morgan from "morgan";
import { WebSocketServer } from "ws";
import * as rest from "./server/rest.js";
import { createExpressContext } from "./server/trpc/commands/context.js";
import { commandsRouter } from "./server/trpc/commands/router.js";
import { createWsContext } from "./server/trpc/subscriptions/context.js";
import { subscriptionsRouter } from "./server/trpc/subscriptions/router.js";

export const userIdCookieName = "user-id";
const app = Express();

app.use(morgan("dev"));

app.get("/", async (req, res) => {
  res.sendStatus(200);
});

app.use("/rest", rest.router);

app.use(
  "/trpc/commands",
  cors({
    credentials: true,
    origin: env.HTTP_CORS_ORIGINS,
  }),
  cookieParser(),
  createExpressMiddleware({
    router: commandsRouter,
    createContext: createExpressContext,
    onError: (e) => {
      if (e.error.code === "INTERNAL_SERVER_ERROR") {
        console.error(e.error.cause);
      }
    },
  }),
);

const server = app.listen(env.PORT, env.HOST, () => {
  konsole.info(`Server running at http://${env.HOST}:${env.PORT}`);
});

const wss = new WebSocketServer({ server, path: "/trpc/subscriptions" });

const trpcWsHandler = trpcWs.applyWSSHandler({
  wss,
  router: subscriptionsRouter,
  createContext: createWsContext,
});

process.on("SIGTERM", () => {
  trpcWsHandler.broadcastReconnectNotification();
});

server.keepAliveTimeout = 2 ** 31 - 1;
