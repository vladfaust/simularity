import { Router } from "express";

import email from "./auth/email.js";
import nonce from "./auth/nonce.js";
import oauth from "./auth/oauth.js";

export default Router()
  .use("/email", email)
  .use("/nonce", nonce)
  .use("/oauth", oauth);
