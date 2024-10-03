import { t } from "@/server/trpc.js";

import balance from "./account/balance.js";
import get from "./account/get.js";

export default t.router({
  balance,
  get,
});
