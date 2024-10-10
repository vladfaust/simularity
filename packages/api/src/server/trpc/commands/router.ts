import { t } from "@/server/trpc.js";

import account from "./routes/account.js";
import auth from "./routes/auth.js";
import models from "./routes/models.js";
import scenarios from "./routes/scenarios.js";
import users from "./routes/users.js";

export const commandsRouter = t.router({
  account,
  auth,
  models,
  scenarios,
  users,
});

export type CommandsRouter = typeof commandsRouter;
