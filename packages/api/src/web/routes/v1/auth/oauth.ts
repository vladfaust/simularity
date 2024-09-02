import { Router } from "express";

import callback from "./oauth/callback.js";
import create from "./oauth/create.js";

export default Router().use("/callback", callback).use("/", create);
