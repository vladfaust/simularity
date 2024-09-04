import { Router } from "express";

import auth from "./v1/auth.js";
import completions from "./v1/completions.js";
import models from "./v1/models.js";
import patreon from "./v1/patreon.js";
import tts from "./v1/tts.js";
import users from "./v1/users.js";

export default Router()
  .use("/auth", auth)
  .use("/completions", completions)
  .use("/models", models)
  .use("/patreon", patreon)
  .use("/tts", tts)
  .use("/users", users);
