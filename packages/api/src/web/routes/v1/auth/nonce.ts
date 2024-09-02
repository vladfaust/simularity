import { Router } from "express";

import create from "./nonce/create.js";
import get from "./nonce/get.js";

export default Router().use("/", create).use("/", get);
