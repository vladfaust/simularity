import { Router } from "express";

import create from "./inferenceNodes/create.js";
import heartbeat from "./inferenceNodes/heartbeat.js";

export default Router().use(create).use(heartbeat);
