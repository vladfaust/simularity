import { Router } from "express";

import getAsset from "./scenarios/assets/get.js";

export default Router().use("/", getAsset);
