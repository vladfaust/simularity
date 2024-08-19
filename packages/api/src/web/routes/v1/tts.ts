import { Router } from "express";

import create from "./tts/create.js";

export default Router().use("/", create);
