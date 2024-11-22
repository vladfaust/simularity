import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cookieParser from "cookie-parser";
import cors from "cors";
import Express from "express";
import morgan from "morgan";
import * as rest from "./server/rest.js";
import { createExpressContext } from "./server/trpc/commands/context.js";
import { commandsRouter } from "./server/trpc/commands/router.js";

export const userIdCookieName = "user-id";
const app = Express();

app.use(morgan("dev"));

app.get("/", async (req, res) => {
  res.sendStatus(200);
});

app.use(
  "/rest",
  cors({
    credentials: true,
    origin: env.HTTP_CORS_ORIGINS,
  }),
  rest.router,
);

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

server.keepAliveTimeout = 2 ** 31 - 1;
