import { konsole } from "@/lib/konsole";
import { updateScenario } from "./_common";

// Update the scenario with the new manifest and assets.
//

try {
  await updateScenario(process.argv[2], process.argv[3], false);
  process.exit(0);
} catch (e) {
  konsole.error(e);
  process.exit(1);
}
