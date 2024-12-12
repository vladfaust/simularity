import { t } from "@/server/trpc.js";

import createCompletion from "./text2Text/createCompletion.js";

export default t.router({
  createCompletion,
});
