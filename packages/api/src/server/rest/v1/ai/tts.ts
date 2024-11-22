import { Router } from "express";

import createCompletion from "./tts/createCompletion.js";

export default Router().use("/", createCompletion);
