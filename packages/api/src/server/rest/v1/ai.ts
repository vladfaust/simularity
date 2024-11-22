import { Router } from "express";

import tts from "./ai/tts.js";
import ttt from "./ai/ttt.js";

export default Router().use("/tts", tts).use("/ttt", ttt);
