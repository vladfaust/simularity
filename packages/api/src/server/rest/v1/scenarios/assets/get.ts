import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { pipe } from "@/lib/s3+express.js";
import { keyExists } from "@/lib/s3.js";
import { AssetSchema, scenarioAssets } from "@/lib/schema/scenarios.js";
import { v } from "@/lib/valibot";
import { getActivePatreonTier } from "@/logic/patreon.js";
import {
  fetchScenarioManifest,
  scenarioAssetKey,
  scenarioRequiredPatreonTierIndex,
} from "@/logic/scenarios.js";
import { getAuthenticatedUserId } from "@/server/rest/v1/_common.js";
import cors from "cors";
import { eq } from "drizzle-orm";
import { toSeconds } from "duration-fns";
import { Router } from "express";

const MANIFEST_FILE_NAME = "manifest.json";

/**
 * Get a scenario asset by path query.
 * @example `GET /v1/scenarios/abc123/assets?version=1&path=image.jpg`
 */
export default Router()
  .use(cors())
  .get("/:scenarioId/assets", async (req, res) => {
    const scenarioId = req.params.scenarioId;

    const version = req.query.version;
    if (typeof version !== "string") {
      return res.status(400).json({ error: "version query is required" });
    }

    const assetPath = req.query.path;
    if (typeof assetPath !== "string") {
      return res.status(400).json({ error: "path query is required" });
    }

    const userId = await getAuthenticatedUserId(req);

    const scenario = await d.db.query.scenarios.findFirst({
      where: eq(d.scenarios.id, scenarioId),
      columns: {
        id: true,
        version: true,
        versionMap: true,
        requiredPatreonTierId: true,
      },
    });

    if (!scenario) {
      return res.status(404).json({ error: "Scenario not found" });
    }

    const manifest = await fetchScenarioManifest(scenario);

    let assetEntry:
      | {
          public?: boolean;
          asset: v.InferOutput<typeof AssetSchema>;
        }
      | undefined;

    if (assetPath === MANIFEST_FILE_NAME) {
      assetEntry = {
        asset: {
          path: assetPath,
          versionId: scenario.versionMap[version],
        },
      };
    } else {
      assetEntry = [...scenarioAssets(manifest)].find(
        (entry) => entry.asset.path === assetPath,
      );

      if (!assetEntry) {
        return res.status(404).json({ error: "Asset not found" });
      }
    }

    const requiredTierIndex = scenarioRequiredPatreonTierIndex(scenario);
    if (!assetEntry.public && requiredTierIndex !== null) {
      if (!userId) return res.status(401);

      const activePatreonTier = await getActivePatreonTier(userId);

      if (!activePatreonTier || activePatreonTier.index < requiredTierIndex) {
        konsole.debug(
          `User required premium scenario private asset, but is not on the required tier`,
          {
            scenarioId,
            version,
            assetPath,
            requiredTierIndex,
            activePatreonTier,
          },
        );

        return res.status(404).json({ error: `Asset not found` });
      }
    }

    const key = scenarioAssetKey(scenarioId, assetPath);

    if (!(await keyExists(key, assetEntry.asset.versionId))) {
      throw new Error(
        `Scenario asset does not exist in S3: ${key} (version ${assetEntry.asset.versionId})`,
      );
    }

    return pipe(key, assetEntry.asset.versionId, res, toSeconds({ years: 1 }));
  });
