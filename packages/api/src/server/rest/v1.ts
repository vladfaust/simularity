import { Router } from "express";

import account from "./v1/account.js";
import ai from "./v1/ai.js";
import patreon from "./v1/patreon.js";
import releases from "./v1/releases.js";
import scenarios from "./v1/scenarios.js";
import users from "./v1/users.js";

export default Router()
  .use("/account", account)
  .use("/ai", ai)
  .use("/patreon", patreon)
  .use("/releases", releases)
  .use("/scenarios", scenarios)
  .use("/users", users);
