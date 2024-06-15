import { Router } from "express";

import gpts from "./routes/gpts.js";
import inferenceNodes from "./routes/inferenceNodes.js";

export default Router().use(gpts).use(inferenceNodes);
