import { t } from "@/server/trpc.js";

import getAssetMap from "./scenarios/getAssetMap.js";
import getScenario from "./scenarios/getScenario.js";
import indexScenarios from "./scenarios/indexScenarios.js";

export default t.router({
  getAssetMap,
  getScenario,
  indexScenarios,
});
