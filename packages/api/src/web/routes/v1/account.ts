import { Router } from "express";

import balance from "./account/balance.js";
import get from "./account/get.js";

export default Router().use("/balance", balance).use("/", get);
