import { t } from "@/server/trpc.js";

import indexLlmModels from "./models/indexLlmModels.js";
import indexTtsModels from "./models/indexTtsModels.js";

export default t.router({
  indexLlmModels,
  indexTtsModels,
});
