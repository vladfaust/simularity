import { Router } from "express";

import v1 from "./rest/v1.js";

export const router = Router().use("/v1", v1);
