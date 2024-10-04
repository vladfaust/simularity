import { resolveBaseDir, RESOURCES_PATH } from "@/lib/tauri";
import { safeParseJson } from "@/lib/utils";
import { formatIssues } from "@/lib/valibot";
import * as schema from "@simularity/api/lib/schema";
import {
  BaseDirectory,
  createDir,
  exists,
  readDir,
  readTextFile,
} from "@tauri-apps/api/fs";
import { join, resolve, resolveResource } from "@tauri-apps/api/path";
import { LocalBaseScenario } from "./classes/local/base";
import { LocalImmersiveScenario } from "./classes/local/immersive";

export class ScenarioReadError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "Scenario read error";
  }
}

export class ScenarioParseError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "Scenario parse error";
  }
}

export type Scenario = LocalBaseScenario | LocalImmersiveScenario;

export const SCENARIOS_DIR = "scenarios";
export const MANIFEST_FILE_NAME = "manifest.json";

export async function defaultScenariosDir() {
  return join(await resolveBaseDir(BaseDirectory.AppLocalData), SCENARIOS_DIR);
}

/**
 * Read all scenarios from the local data and resource directories.
 */
export async function readAllLocalScenarios(): Promise<Scenario[]> {
  const scenarios = await _readLocalScenarios(
    BaseDirectory.Resource,
    SCENARIOS_DIR,
  );

  const localScenarios = await _readLocalScenarios(
    BaseDirectory.AppLocalData,
    SCENARIOS_DIR,
  );

  return [...scenarios, ...localScenarios];
}

/**
 * Try reading a local scenario by ID.
 */
export async function readLocalScenario(id: string): Promise<Scenario | null> {
  try {
    return await ensureLocalScenario(id);
  } catch (e: any) {
    if (e instanceof ScenarioReadError) {
      return null;
    } else {
      throw e;
    }
  }
}

/**
 * Find a local scenario by ID, first looking in the resource directory,
 * then in the local data directory.
 *
 * @throws If the scenario is not found in either directory.
 */
export async function ensureLocalScenario(id: string): Promise<Scenario> {
  // First, try to read the scenario from the resource directory.
  const scenario = await _readLocalScenario(
    BaseDirectory.Resource,
    SCENARIOS_DIR,
    id,
  ).catch((e: any) => {
    if (e instanceof ScenarioReadError) return null;
    else throw e;
  });

  if (scenario) {
    return scenario;
  }

  // If the scenario is not found in the resource directory, try the local data directory.
  return await _readLocalScenario(
    BaseDirectory.AppLocalData,
    SCENARIOS_DIR,
    id,
  );
}

/**
 * Read all scenarios from a local data directory.
 */
async function _readLocalScenarios(
  baseDir: BaseDirectory,
  dir: string,
): Promise<Scenario[]> {
  let scenariosDir;

  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      if (!(await exists(dir, { dir: baseDir }))) {
        await createDir(dir, { dir: baseDir });
      }

      scenariosDir = await resolve(await resolveBaseDir(baseDir), dir);
      break;

    case BaseDirectory.Resource:
      scenariosDir = await resolveResource(`${RESOURCES_PATH}/${dir}`);
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
      const scenario = await _readLocalScenario(baseDir, dir, entry.name);
      scenarios.push(scenario);
    } catch (e: any) {
      if (e instanceof ScenarioParseError) {
        console.error(e);
      } else {
        throw e;
      }
    }
  }

  return scenarios;
}

/**
 * Read a scenario from the local data or resource directory.
 */
async function _readLocalScenario(
  baseDir: BaseDirectory,
  dir: string,
  id: string,
): Promise<Scenario> {
  let path, manifestPath;

  switch (baseDir) {
    case BaseDirectory.AppLocalData:
      path = await resolve(await resolveBaseDir(baseDir), dir, id);
      manifestPath = await join(path, MANIFEST_FILE_NAME);

      break;
    case BaseDirectory.Resource:
      path = await resolveResource(`${RESOURCES_PATH}/${dir}/${id}`);
      manifestPath = await resolveResource(
        `${RESOURCES_PATH}/${dir}/${id}/${MANIFEST_FILE_NAME}`,
      );

      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  let manifestString;
  try {
    console.debug(`Reading local scenario from ${manifestPath}`);
    manifestString = await readTextFile(manifestPath);
  } catch (error: any) {
    throw new ScenarioReadError(manifestPath, error.message);
  }

  const manifestJsonParseResult = safeParseJson<any>(manifestString);
  if (!manifestJsonParseResult.success) {
    throw new ScenarioParseError(manifestPath, manifestJsonParseResult.error);
  }

  const scenarioParseResult = schema.scenarios.safeParseScenarioManifest(
    manifestJsonParseResult.output,
  );

  if (!scenarioParseResult.success) {
    throw new ScenarioParseError(
      manifestPath,
      formatIssues(scenarioParseResult.issues),
    );
  }

  if (
    "immersive" in scenarioParseResult.output &&
    scenarioParseResult.output.immersive
  ) {
    console.debug(`Read local immersive scenario: ${id}`);

    return new LocalImmersiveScenario(
      baseDir === BaseDirectory.Resource,
      id,
      path,
      scenarioParseResult.output,
    );
  } else {
    console.debug(`Read local base scenario: ${id}`);

    return new LocalBaseScenario(
      baseDir === BaseDirectory.Resource,
      id,
      path,
      scenarioParseResult.output,
    );
  }
}
