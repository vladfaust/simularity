import { Router } from "express";

import patreon from "./v1/patreon.js";
import scenarios from "./v1/scenarios.js";

export default Router().use("/patreon", patreon).use("/scenarios", scenarios);
