import { Router } from "express";

import email from "./auth/email.js";
import nonce from "./auth/nonce.js";

export default Router().use("/email", email).use("/nonce", nonce);
