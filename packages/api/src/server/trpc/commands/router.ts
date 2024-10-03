import { t } from "@/server/trpc.js";

import account from "./routes/account.js";
import auth from "./routes/auth.js";
import models from "./routes/models.js";

export const commandsRouter = t.router({
  account,
  auth,
  models,
});

export type CommandsRouter = typeof commandsRouter;
