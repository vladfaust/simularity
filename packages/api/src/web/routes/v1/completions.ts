import { Router } from "express";

import create from "./completions/create.js";

export default Router().use("/", create);
