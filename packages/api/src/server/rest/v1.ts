import { Router } from "express";

import patreon from "./v1/patreon.js";

export default Router().use("/patreon", patreon);
