import { Router } from "express";

import commit from "./gpts/commit.js";
import create from "./gpts/create.js";
import decode from "./gpts/decode.js";
import delete_ from "./gpts/delete.js";
import infer from "./gpts/infer.js";
import tokenCount from "./gpts/tokenCount.js";

export default Router()
  .use(commit)
  .use(create)
  .use(decode)
  .use(delete_)
  .use(infer)
  .use(tokenCount);
