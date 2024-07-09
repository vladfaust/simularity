import { Router } from "express";

import abortInference from "./gpts/abortInference.js";
import commit from "./gpts/commit.js";
import create from "./gpts/create.js";
import decode from "./gpts/decode.js";
import delete_ from "./gpts/delete.js";
import find from "./gpts/find.js";
import infer from "./gpts/infer.js";
import reset from "./gpts/reset.js";

export default Router()
  .use(abortInference)
  .use(commit)
  .use(create)
  .use(decode)
  .use(delete_)
  .use(find)
  .use(infer)
  .use(reset);
