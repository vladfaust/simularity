import { Router } from "express";

import tts from "./ai/tts.js";

export default Router().use("/tts", tts);
