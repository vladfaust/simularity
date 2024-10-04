import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { storeBuffer, storeFile } from "@/lib/s3.js";
import {
  AssetSchema,
  safeParseScenarioManifest,
  scenarioAssets,
} from "@/lib/schema/scenarios.js";
import { omit, sha256File } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import { fetchScenarioManifest, scenarioAssetKey } from "@/logic/scenarios.js";
import deepDiff from "deep-diff";
import { eq, sql } from "drizzle-orm";
import jp from "jsonpath";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Update or create a scenario with a new manifest and assets.
 * @example `npm run scenarios:upload -- scenarioId path/to/manifest.json`
 */
export async function updateScenario(
  scenarioId: string,
  manifestPath: string,
  check: boolean,
) {
  const manifestJson = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const parseResult = safeParseScenarioManifest(manifestJson);

  if (!parseResult.success) {
    throw new Error(
      `Invalid manifest: ${JSON.stringify(v.flatten(parseResult.issues))}`,
    );
  }

  const manifest = parseResult.output;

  /**
   * jsonpath => asset.
   */
  const assetMap = new Map<string, v.InferOutput<typeof AssetSchema>>();

  // Collect assets, their hashes and sizes.
  for (const { jsonpath, asset } of scenarioAssets(manifest)) {
    const realpath = path.resolve(path.dirname(manifestPath), asset.path);
    asset.hash = await sha256File(realpath);
    asset.size = statSync(realpath).size;
    assetMap.set(jsonpath, asset);
  }

  // Get the existing scenario to compare assets.
  const existingScenario = await d.db.query.scenarios.findFirst({
    where: eq(d.scenarios.id, scenarioId),
    columns: {
      id: true,
      version: true,
      versionMap: true,
    },
  });

  const existingScenarioManifest = existingScenario
    ? await fetchScenarioManifest(existingScenario)
    : undefined;

  // Delete assets with the same hash if they already exist.
  if (existingScenarioManifest) {
    let dropped = 0;

    for (const [jsonpath, asset] of assetMap) {
      const existingAsset: v.InferOutput<typeof AssetSchema> | undefined = jp
        .query(existingScenarioManifest, jsonpath)
        .at(0);

      if (existingAsset?.hash === asset.hash!) {
        asset.versionId = existingAsset.versionId;
        assetMap.delete(jsonpath);
        dropped++;
      }
    }

    if (dropped) konsole.debug(`Dropped ${dropped} assets with same hash`);
  }

  if (assetMap.size === 0) {
    konsole.log(`No new assets to upload`);

    // Compare manifests.
    if (existingScenarioManifest) {
      const diff = deepDiff(
        omit(existingScenarioManifest, ["version"]),
        omit(manifest, ["version"]),
      )?.at(0);

      if (diff) {
        konsole.debug(diff);

        if (check) {
          konsole.log(`Manifests differ, exiting`);
          return;
        } else {
          konsole.log(`Manifests differ, updating scenario...`);
        }
      } else {
        konsole.log(`Manifests are identical, exiting`);
        return;
      }
    }
  } else if (check) {
    konsole.log(`Would upload ${assetMap.size} new assets; exiting`);
    return;
  }

  if (assetMap.size) {
    konsole.log(`Uploading ${assetMap.size} new assets`);

    for (const [jsonpath, asset] of assetMap) {
      const key = scenarioAssetKey(scenarioId, asset.path);
      const realpath = path.resolve(path.dirname(manifestPath), asset.path);

      konsole.debug(`Uploading asset at ${jsonpath}`, {
        filepath: asset.path,
        realpath,
        hash: asset.hash,
        key,
      });

      const result = await storeFile(key, realpath);

      if (!result.VersionId) {
        konsole.debug(result);
        throw new Error(`Missing VersionId in S3 response`);
      }

      asset.versionId = result.VersionId;
    }

    // Update the manifest with the new asset map.
    for (const [jsonpath, asset] of assetMap) {
      jp.apply(manifest, jsonpath, () => asset);
    }
  }

  // Update the scenario version.
  manifest.version = existingScenario?.version
    ? existingScenario.version + 1
    : 1;

  // Upload the new manifest.
  const key = scenarioAssetKey(scenarioId, "manifest.json");
  konsole.log(`Uploading manifest to S3`, { key, version: manifest.version });

  const result = await storeBuffer(
    key,
    Buffer.from(JSON.stringify(manifest), "utf-8"),
  );

  if (!result.VersionId) {
    konsole.debug(result);
    throw new Error(`Missing VersionId in S3 response`);
  }

  if (existingScenario) {
    konsole.log(`Updating existing scenario`);

    await d.db
      .update(d.scenarios)
      .set({
        version: manifest.version,
        name: manifest.name,
        nsfw: manifest.nsfw,
        versionMap: {
          ...existingScenario.versionMap,
          [manifest.version.toString()]: result.VersionId,
        },
        updatedAt: sql`now()`,
      })
      .where(eq(d.scenarios.id, scenarioId));
  } else {
    konsole.log(`Creating new scenario`);

    await d.db.insert(d.scenarios).values({
      id: scenarioId,
      version: manifest.version,
      name: manifest.name,
      nsfw: manifest.nsfw ?? false,
      versionMap: { [manifest.version.toString()]: result.VersionId },
    });
  }
}
