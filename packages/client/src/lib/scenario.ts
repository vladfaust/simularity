import { LocalBaseScenario } from "./scenario/classes/local/base";
import { LocalImmersiveScenario } from "./scenario/classes/local/immersive";
import { RemoteScenario } from "./scenario/classes/remote";

export { LocalBaseScenario, LocalImmersiveScenario, RemoteScenario };
export type LocalScenario = LocalBaseScenario | LocalImmersiveScenario;
export type Scenario = LocalScenario | RemoteScenario;

export * from "./scenario/readers";
