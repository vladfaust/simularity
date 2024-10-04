import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { scenarioAssets } from "@/lib/schema/scenarios.js";
import { v } from "@/lib/valibot.js";
import { getActivePatreonTier } from "@/logic/patreon.js";
import {
  fetchScenarioManifest,
  scenarioRequiredPatreonTierIndex,
} from "@/logic/scenarios.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";
import { TRPCError } from "@trpc/server";
import { wrap } from "@typeschema/valibot";
import { eq } from "drizzle-orm";

export default protectedProcedure
  .input(
    wrap(
      v.object({
        scenarioId: v.string(),
        scenarioVersion: v.optional(v.number()),
      }),
    ),
  )
  .output(
    wrap(
      v.record(
        v.string(), // Asset path (relative to manifest).
        v.object({
          hash: v.string(),
          versionId: v.string(),
          size: v.number(),
        }),
      ),
    ),
  )
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

    const requiredTierIndex = scenarioRequiredPatreonTierIndex(scenario);

    if (requiredTierIndex !== null) {
      const activePatreonTier = await getActivePatreonTier(ctx.userId);

      if (!activePatreonTier || activePatreonTier.index < requiredTierIndex) {
        konsole.debug(
          `User required premium scenario asset map, but is not on the required tier`,
          {
            scenarioId: scenario.id,
            requiredTierIndex,
            activePatreonTier,
          },
        );

        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Scenario requires premium tier",
        });
      }
    }

    const manifest = await fetchScenarioManifest(
      scenario,
      input.scenarioVersion,
    );

    const assetMap: Record<
      string,
      { hash: string; versionId: string; size: number }
    > = {};

    for (const { asset } of scenarioAssets(manifest)) {
      assetMap[asset.path] = {
        hash: asset.hash!,
        versionId: asset.versionId!,
        size: asset.size!,
      };
    }

    return assetMap;
  });
