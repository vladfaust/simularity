import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { redis } from "@/lib/redis.js";
import * as s3 from "@/lib/s3.js";
import {
  BaseScenarioSchema,
  ImmersiveScenarioSchema,
  safeParseScenarioManifest,
} from "@/lib/schema/scenarios.js";
import { v } from "@/lib/valibot.js";
import { toSeconds } from "duration-fns";
import path from "path";

export function scenarioAssetKey(scenarioId: string, assetPath: string) {
  return `scenarios/${scenarioId}/${path.normalize(assetPath)}`;
}

/**
 * Fetch scenario manifest from Redis, or from S3 if not found in Redis.
 * @param version Optional version ID to fetch a specific version of the scenario.
 * @throws If the scenario manifest is not found in S3.
 */
export async function fetchScenarioManifest(
  scenario: Pick<
    typeof d.scenarios.$inferSelect,
    "id" | "version" | "versionMap"
  >,
  version?: number,
): Promise<
  | v.InferOutput<typeof BaseScenarioSchema>
  | v.InferOutput<typeof ImmersiveScenarioSchema>
> {
  const scenarioVersion = version ?? scenario.version;
  const s3VersionId = scenario.versionMap[scenarioVersion.toString()];

  let manifestString = await redis.get(
    redisScenarioManifestKey(scenario.id, s3VersionId),
  );

  if (!manifestString) {
    konsole.debug(`Fetching scenario manifest from S3`, {
      scenarioId: scenario.id,
      scenarioVersion,
      s3VersionId,
    });

    const key = scenarioAssetKey(scenario.id, "manifest.json");
    if (!(await s3.keyExists(key, s3VersionId))) {
      throw new Error(`Scenario manifest not found in S3: ${key}`);
    }

    const data = await s3.objectToBuffer(key);
    manifestString = data.toString("utf8");

    await redis.setex(
      redisScenarioManifestKey(scenario.id, s3VersionId),
      toSeconds({ days: 1 }),
      manifestString,
    );
  } else {
    // konsole.debug(`Fetched scenario manifest from Redis`, {
    //   scenarioId: scenario.id,
    //   scenarioVersion,
    //   s3VersionId,
    // });
  }

  const manifestJson = JSON.parse(manifestString);
  const parseResult = safeParseScenarioManifest(manifestJson);

  if (!parseResult.success) {
    console.debug(manifestJson.episodes.arrival.chunks[0].writerUpdate);
    throw new Error(
      `Invalid manifest: ${JSON.stringify(v.flatten(parseResult.issues))}`,
    );
  }

  return parseResult.output;
}

/**
 * Get the index of the required Patreon tier for a scenario,
 * or null if no tier is required.
 */
export function scenarioRequiredPatreonTierIndex(
  scenario: Pick<
    typeof d.scenarios.$inferSelect,
    "id" | "requiredPatreonTierId"
  >,
): number | null {
  if (scenario.requiredPatreonTierId) {
    const requiredTierIndex = env.PATREON_TIERS.findIndex(
      (t) => t.id === scenario.requiredPatreonTierId,
    );

    if (requiredTierIndex === -1) {
      throw new Error(
        `Scenario ${scenario.id} requires unknown Patreon tier ${scenario.requiredPatreonTierId}`,
      );
    }

    return requiredTierIndex;
  } else {
    return null;
  }
}

function redisScenarioManifestKey(scenarioId: string, s3VersionId: string) {
  return `scenarios:${scenarioId}:manifest.json:${s3VersionId}`;
}
