import { Router } from "express";

import authorizeNonce from "./auth/authorizeNonce.js";
import create from "./auth/create.js";
import get from "./auth/get.js";

export default Router().use("/", authorizeNonce).use("/", create).use("/", get);
