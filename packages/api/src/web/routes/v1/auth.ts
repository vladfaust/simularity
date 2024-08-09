import { Router } from "express";

import create from "./auth/create.js";

export default Router().use("/", create);
