import { t } from "@/server/trpc.js";

import authorize from "./nonce/authorize.js";
import check from "./nonce/check.js";

export default t.router({
  authorize,
  check,
});
