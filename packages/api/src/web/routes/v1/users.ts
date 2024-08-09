import { Router } from "express";

import create from "./users/create.js";
import get from "./users/get.js";

export default Router().use("/", create).use("/", get);
