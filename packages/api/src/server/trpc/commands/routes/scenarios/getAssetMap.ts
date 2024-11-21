import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { scenarioAssets } from "@/lib/schema/scenarios.js";
import { v } from "@/lib/valibot.js";
import { fetchScenarioManifest } from "@/logic/scenarios.js";
import { t } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { wrap } from "@typeschema/valibot";
import { and, eq, gte, sql } from "drizzle-orm";

export default t.procedure
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
        requiredSubscriptionTier: true,
      },
    });

    if (!scenario) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Scenario not found",
      });
    }

    if (scenario.requiredSubscriptionTier !== null) {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Scenario requires subscription",
        });
      }

      const activeSubscription = await d.db.query.subscriptions.findFirst({
        where: and(
          eq(d.subscriptions.userId, ctx.userId),
          eq(d.subscriptions.tier, scenario.requiredSubscriptionTier),
          gte(d.subscriptions.activeUntil, sql`now()`),
        ),
      });

      if (!activeSubscription) {
        konsole.debug(`Unauthorized access to scenario asset map`, {
          userId: ctx.userId,
          scenarioId: scenario.id,
          requiredSubscriptionTier: scenario.requiredSubscriptionTier,
        });

        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Scenario requires subscription: ${
            scenario.requiredSubscriptionTier
          }`,
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
