import { t } from "@/server/trpc.js";

import createCompletion from "./text2Speech/createCompletion.js";

export default t.router({
  createCompletion,
});
