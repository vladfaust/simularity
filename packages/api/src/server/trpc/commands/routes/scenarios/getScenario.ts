import { d } from "@/lib/drizzle.js";
import { MultiLocaleTextSchema, SubscriptionTierSchema } from "@/lib/schema.js";
import {
  AssetSchema,
  IdSchema,
  scenarioAssets,
} from "@/lib/schema/scenarios.js";
import { v } from "@/lib/valibot.js";
import { fetchScenarioManifest } from "@/logic/scenarios.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

const OutputSchema = v.nullable(
  v.object({
    version: v.number(),
    locales: v.array(v.string()),
    name: MultiLocaleTextSchema,
    requiredSubscriptionTier: v.nullable(SubscriptionTierSchema),
    nsfw: v.boolean(),
    immersive: v.boolean(),
    contextWindowSize: v.number(),
    tags: v.optional(v.array(v.string())),
    icon: v.optional(AssetSchema),
    logo: v.optional(AssetSchema),
    thumbnail: v.optional(AssetSchema),
    coverImage: v.optional(AssetSchema),
    teaser: MultiLocaleTextSchema,
    about: MultiLocaleTextSchema,
    characters: v.record(
      IdSchema,
      v.object({
        name: MultiLocaleTextSchema,
        color: v.optional(v.string()),
        about: MultiLocaleTextSchema,
        pfp: v.optional(AssetSchema),
      }),
    ),
    episodes: v.record(
      IdSchema,
      v.object({
        name: MultiLocaleTextSchema,
        about: MultiLocaleTextSchema,
        image: v.optional(AssetSchema),
      }),
    ),
    achievements: v.optional(
      v.record(
        IdSchema,
        v.object({
          title: MultiLocaleTextSchema,
          description: MultiLocaleTextSchema,
          icon: v.optional(AssetSchema),
          points: v.number(),
        }),
      ),
    ),
    downloadSize: v.number(),
  }),
);

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
        requiredSubscriptionTier: true,
      },
    });

    if (!scenario) {
      return null;
    }

    const manifest = await fetchScenarioManifest(
      scenario,
      input.scenarioVersion,
    );

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
      requiredSubscriptionTier: scenario.requiredSubscriptionTier,
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
