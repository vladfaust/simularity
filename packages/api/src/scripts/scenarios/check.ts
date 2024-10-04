import { konsole } from "@/lib/konsole.js";
import { updateScenario } from "./_common";

// Check if the scenario is valid, but do not upload it.
//

try {
  await updateScenario(process.argv[2], process.argv[3], true);
  process.exit(0);
} catch (e) {
  konsole.error(e);
  process.exit(1);
}
