import { Router } from "express";

import create from "./email/create.js";
import get from "./email/get.js";

export default Router().use("/", create).use("/", get);
