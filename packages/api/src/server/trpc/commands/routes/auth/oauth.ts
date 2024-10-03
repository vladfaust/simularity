import { t } from "@/server/trpc.js";

import callback from "./oauth/callback.js";
import create from "./oauth/create.js";

export default t.router({
  callback,
  create,
});
