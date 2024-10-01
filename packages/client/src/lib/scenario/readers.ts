import { resolveBaseDir, RESOURCES_PATH } from "@/lib/tauri";
import { safeParseJson } from "@/lib/utils";
import { formatIssues, v } from "@/lib/valibot";
import {
  BaseDirectory,
  createDir,
  exists,
  readDir,
  readTextFile,
} from "@tauri-apps/api/fs";
import { join, resolve, resolveResource } from "@tauri-apps/api/path";
import { BaseScenario } from "./classes/base";
import { ImmersiveScenario } from "./classes/immersive";
import { BaseScenarioSchema } from "./schemas/base";
import { ImmersiveScenarioSchema } from "./schemas/immersive";

const MANIFEST_FILE_NAME = "manifest.json";

export class ScenarioError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = `ScenarioError at ${path}`;
  }
}

export type Scenario = BaseScenario | ImmersiveScenario;

export async function readScenarios(
  baseDir: BaseDirectory,
): Promise<Scenario[]> {
  let scenariosDir;

  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      if (!(await exists("scenarios", { dir: baseDir }))) {
        await createDir("scenarios", { dir: baseDir });
      }

      scenariosDir = await resolve(await resolveBaseDir(baseDir), "scenarios");
      break;

    case BaseDirectory.Resource:
      scenariosDir = await resolveResource(`${RESOURCES_PATH}/scenarios`);
      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  const scenarios: Scenario[] = [];
  // console.debug(`Reading scenarios from ${scenariosDir}`);
  const entries = await readDir(scenariosDir);

  for (const entry of entries) {
    if (!entry.name || !entry.children) continue;

    try {
      const scenario = await readScenario(baseDir, entry.name);
      scenarios.push(scenario);
    } catch (e: any) {
      if (e instanceof ScenarioError) {
        console.error(e);
      } else {
        throw e;
      }
    }
  }

  return scenarios;
}

export async function readAllScenarios(): Promise<Scenario[]> {
  const scenarios = await readScenarios(BaseDirectory.Resource);
  const localScenarios = await readScenarios(BaseDirectory.AppLocalData);

  return [...scenarios, ...localScenarios];
}

export async function readScenario(
  baseDir: BaseDirectory,
  id: string,
): Promise<Scenario> {
  let path, manifestPath;

  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      path = await resolve(await resolveBaseDir(baseDir), "scenarios", id);
      manifestPath = await join(path, MANIFEST_FILE_NAME);

      break;
    case BaseDirectory.Resource:
      path = await resolveResource(`${RESOURCES_PATH}/scenarios/${id}`);
      manifestPath = await resolveResource(
        `${RESOURCES_PATH}/scenarios/${id}/${MANIFEST_FILE_NAME}`,
      );

      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  let manifestString;
  try {
    console.debug(`Reading scenario from ${manifestPath}`);
    manifestString = await readTextFile(manifestPath);
  } catch (error: any) {
    throw new ScenarioError(manifestPath, error.message);
  }

  const manifestJsonParseResult = safeParseJson<any>(manifestString);
  if (!manifestJsonParseResult.success) {
    throw new ScenarioError(manifestPath, manifestJsonParseResult.error);
  }

  const scenarioParseResult = v.safeParse(
    "immersive" in manifestJsonParseResult.output &&
      manifestJsonParseResult.output.immersive
      ? ImmersiveScenarioSchema
      : BaseScenarioSchema,
    manifestJsonParseResult.output,
  );
  if (!scenarioParseResult.success) {
    throw new ScenarioError(
      manifestPath,
      formatIssues(scenarioParseResult.issues),
    );
  }

  if ("immersive" in scenarioParseResult.output) {
    console.debug(`Read immersive scenario: ${id}`);
    return new ImmersiveScenario(
      baseDir === BaseDirectory.Resource,
      id,
      path,
      scenarioParseResult.output,
    );
  } else {
    console.debug(`Read base scenario: ${id}`);
    return new BaseScenario(
      baseDir === BaseDirectory.Resource,
      id,
      path,
      scenarioParseResult.output,
    );
  }
}

/**
 * Find a scenario by ID, first looking in the resource directory,
 * then in the local data directory.
 *
 * @throws If the scenario is not found in either directory.
 */
export async function ensureScenario(id: string): Promise<Scenario> {
  // First, try to read the scenario from the resource directory.
  const scenario = await readScenario(BaseDirectory.Resource, id).catch(
    (e: any) => {
      if (e instanceof ScenarioError) return null;
      else throw e;
    },
  );

  if (scenario) {
    return scenario;
  }

  // If the scenario is not found in the resource directory, try the local data directory.
  return await readScenario(BaseDirectory.AppLocalData, id);
}
