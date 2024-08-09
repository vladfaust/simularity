import { Router } from "express";

import index from "./models/index.js";

export default Router().use("/", index);
