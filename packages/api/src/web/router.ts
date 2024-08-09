import { Router } from "express";

import v1 from "./routes/v1.js";

export default Router().use("/v1", v1);
