import { t } from "@/server/trpc.js";

import get from "./users/get.js";

export default t.router({
  get,
});
