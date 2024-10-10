import { Router } from "express";

import getBgp from "./users/getBgp";
import getPfp from "./users/getPfp";

export default Router().use("/", getBgp).use("/", getPfp);
