import { Router } from "express";

import abortInference from "./gpts/abortInference.js";
import create from "./gpts/create.js";
import decode from "./gpts/decode.js";
import delete_ from "./gpts/delete.js"; // REFACTOR: Rename to `destroy`.
import find from "./gpts/find.js";
import infer from "./gpts/infer.js";

export default Router()
  .use(abortInference)
  .use(create)
  .use(decode)
  .use(delete_)
  .use(find)
  .use(infer);
