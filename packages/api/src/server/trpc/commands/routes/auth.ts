import { t } from "@/server/trpc.js";

import delete_ from "./auth/delete.js";
import email from "./auth/email.js";
import nonce from "./auth/nonce.js";
import oauth from "./auth/oauth.js";

export default t.router({
  delete: delete_,
  email,
  nonce,
  oauth,
});
