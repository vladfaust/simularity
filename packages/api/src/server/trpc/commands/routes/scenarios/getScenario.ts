import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { PatreonTier } from "@/lib/schema.js";
import {
  AssetSchema,
  IdSchema,
  scenarioAssets,
} from "@/lib/schema/scenarios.js";
import { v } from "@/lib/valibot.js";
import { fetchScenarioManifest } from "@/logic/scenarios.js";
import { t } from "@/server/trpc.js";
import { TRPCError } from "@trpc/server";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

const OutputSchema = v.object({
  version: v.number(),
  name: v.string(),
  requiredPatreonTier: v.nullable(
    v.object({
      ...PatreonTier.entries,
      index: v.number(),
    }),
  ),
  nsfw: v.boolean(),
  immersive: v.boolean(),
  tags: v.optional(v.array(v.string())),
  icon: v.optional(AssetSchema),
  logo: v.optional(AssetSchema),
  thumbnail: v.optional(AssetSchema),
  coverImage: v.optional(AssetSchema),
  teaser: v.string(),
  about: v.string(),
  characters: v.record(
    IdSchema,
    v.object({
      name: v.string(),
      color: v.optional(v.string()),
      about: v.string(),
      pfp: v.optional(AssetSchema),
    }),
  ),
  episodes: v.record(
    IdSchema,
    v.object({
      name: v.string(),
      about: v.string(),
      image: v.optional(AssetSchema),
    }),
  ),
  achievements: v.optional(
    v.record(
      IdSchema,
      v.object({
        title: v.string(),
        description: v.string(),
        icon: v.optional(AssetSchema),
        points: v.number(),
      }),
    ),
  ),
  downloadSize: v.number(),
});

/**
 * Get a single scenario by ID.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        scenarioId: v.string(),
        scenarioVersion: v.optional(v.number()),
      }),
    ),
  )
  .output(wrap(OutputSchema))
  .query(async ({ ctx, input }) => {
    const scenario = await d.db.query.scenarios.findFirst({
      where: eq(d.scenarios.id, input.scenarioId),
      columns: {
        id: true,
        version: true,
        versionMap: true,
        requiredPatreonTierId: true,
      },
    });

    if (!scenario) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Scenario not found",
      });
    }

    const manifest = await fetchScenarioManifest(
      scenario,
      input.scenarioVersion,
    );

    let requiredPatreonTier = null;
    if (scenario.requiredPatreonTierId) {
      const index = env.PATREON_TIERS.findIndex(
        (t) => t.id === scenario.requiredPatreonTierId,
      );
      if (index === -1) {
        throw new Error(
          `Scenario ${scenario.id} requires unknown Patreon tier ${scenario.requiredPatreonTierId}`,
        );
      }

      requiredPatreonTier = {
        ...env.PATREON_TIERS[index],
        index,
      };
    }

    // To remove duplicates, we'll use a map.
    const assetMap = new Map<string, v.InferOutput<typeof AssetSchema>>();
    for (const { asset } of scenarioAssets(manifest)) {
      assetMap.set(asset.path, asset);
    }

    let downloadSize = JSON.stringify(manifest).length;
    for (const asset of assetMap.values()) {
      downloadSize += asset.size ?? 0;
    }

    return {
      ...manifest,
      nsfw: manifest.nsfw ?? false,
      immersive: "immersive" in manifest ? manifest.immersive : false,
      requiredPatreonTier,
      characters: Object.fromEntries(
        Object.entries(manifest.characters).map(([id, character]) => [
          id,
          {
            name: character.name,
            color: character.color,
            about: character.about,
            pfp: character.pfp,
          },
        ]),
      ),
      episodes: Object.fromEntries(
        Object.entries(manifest.episodes).map(([id, episode]) => [
          id,
          {
            name: episode.name,
            about: episode.about,
            image: episode.image,
          },
        ]),
      ),
      achievements: manifest.achievements,
      downloadSize,
    };
  });
