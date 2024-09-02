import { Router } from "express";

import get from "./users/get.js";

export default Router().use("/", get);
