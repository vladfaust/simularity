import { t } from "@/server/trpc.js";

import get from "./account/get.js";

export default t.router({
  get,
});
