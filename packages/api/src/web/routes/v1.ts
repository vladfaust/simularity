import { Router } from "express";

import account from "./v1/account.js";
import auth from "./v1/auth.js";
import completions from "./v1/completions.js";
import models from "./v1/models.js";
import patreon from "./v1/patreon.js";
import tts from "./v1/tts.js";

export default Router()
  .use("/account", account)
  .use("/auth", auth)
  .use("/completions", completions)
  .use("/models", models)
  .use("/patreon", patreon)
  .use("/tts", tts);
