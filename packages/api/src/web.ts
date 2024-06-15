import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import Express from "express";
import morgan from "morgan";
import router from "./web/router.js";

const app = Express();

app.use(morgan("dev"));

app.get("/", async (req, res) => {
  res.sendStatus(200);
});

app.use(router);

const server = app.listen(env.PORT, env.HOST, () => {
  konsole.info(`Server running at http://${env.HOST}:${env.PORT}`);
});

server.keepAliveTimeout = 2 ** 31 - 1;
