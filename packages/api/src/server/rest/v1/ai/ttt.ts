import { Router } from "express";

import createCompletion from "./ttt/createCompletion.js";

export default Router().use("/", createCompletion);
