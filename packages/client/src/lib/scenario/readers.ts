import { resolveBaseDir } from "@/lib/tauri";
import { safeParseJson } from "@/lib/utils";
import { formatIssues } from "@/lib/valibot";
import * as schema from "@simularity/api/lib/schema";
import * as taurPath from "@tauri-apps/api/path";
import * as tauriFs from "@tauri-apps/plugin-fs";
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
  return taurPath.join(
    await resolveBaseDir(tauriFs.BaseDirectory.AppLocalData),
    SCENARIOS_DIR,
  );
}

/**
 * Read all scenarios from the local data and resource directories.
 */
export async function readAllLocalScenarios(): Promise<Scenario[]> {
  return _readLocalScenarios(tauriFs.BaseDirectory.AppLocalData, SCENARIOS_DIR);
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
  return _readLocalScenario(
    tauriFs.BaseDirectory.AppLocalData,
    SCENARIOS_DIR,
    id,
  );
}

/**
 * Read all scenarios from a local data directory.
 */
async function _readLocalScenarios(
  baseDir: tauriFs.BaseDirectory,
  dir: string,
): Promise<Scenario[]> {
  let scenariosDir;

  switch (baseDir) {
    case tauriFs.BaseDirectory.AppLocalData:
      if (!(await tauriFs.exists(dir, { baseDir }))) {
        await tauriFs.mkdir(dir, { baseDir });
      }

      scenariosDir = await taurPath.resolve(await resolveBaseDir(baseDir), dir);
      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  const scenarios: Scenario[] = [];
  // console.debug(`Reading scenarios from ${scenariosDir}`);
  const entries = await tauriFs.readDir(scenariosDir);

  for (const entry of entries) {
    if (!entry.name || !entry.isDirectory) continue;

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
  baseDir: tauriFs.BaseDirectory,
  dir: string,
  id: string,
): Promise<Scenario> {
  let path, manifestPath;

  switch (baseDir) {
    case tauriFs.BaseDirectory.AppLocalData:
      path = await taurPath.resolve(await resolveBaseDir(baseDir), dir, id);
      manifestPath = await taurPath.join(path, MANIFEST_FILE_NAME);
      break;

    default:
      throw new Error(`Unimplemented for base directory: ${baseDir}`);
  }

  let manifestString;
  try {
    console.debug(`Reading local scenario from ${manifestPath}`);
    manifestString = await tauriFs.readTextFile(manifestPath);
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
      false,
      id,
      path,
      scenarioParseResult.output,
    );
  } else {
    console.debug(`Read local base scenario: ${id}`);

    return new LocalBaseScenario(false, id, path, scenarioParseResult.output);
  }
}
