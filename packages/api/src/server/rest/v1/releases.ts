import { Router } from "express";

import latest from "./releases/latest";
import specificBinary from "./releases/specificBinary";
import specificVersion from "./releases/specificVersion";

export default Router()
  .use("/", latest)
  .use("/", specificBinary)
  .use("/", specificVersion);
