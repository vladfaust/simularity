import { BaseScenario } from "./scenario/classes/base";
import { ImmersiveScenario } from "./scenario/classes/immersive";
import { BaseScenarioSchema } from "./scenario/schemas/base";
import { ImmersiveScenarioSchema } from "./scenario/schemas/immersive";

export {
  BaseScenario,
  BaseScenarioSchema,
  ImmersiveScenario,
  ImmersiveScenarioSchema,
};

export type Scenario = BaseScenario | ImmersiveScenario;

export * from "./scenario/readers";
