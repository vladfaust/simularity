import { Router } from "express";

import update from "./account/update";

export default Router().use("/", update);
