import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { PatreonTier } from "@/lib/schema.js";
import { v } from "@/lib/valibot.js";
import { addMonths, subMonths } from "date-fns";
import { and, eq, gte } from "drizzle-orm";

/**
 * Get the active highest Patreon tier of a user.
 */
export async function getActivePatreonTier(userId: string): Promise<
  | (v.InferOutput<typeof PatreonTier> & {
      index: number;
      activeUntil: string;
    })
  | null
> {
  const patreonAccount = await d.db.query.oauthAccounts.findFirst({
    where: and(
      eq(d.oauthAccounts.userId, userId),
      eq(d.oauthAccounts.providerId, "patreon"),
    ),
  });

  if (patreonAccount) {
    const patreonPledges = await d.db.query.patreonPledges.findMany({
      where: and(
        eq(d.patreonPledges.patronId, patreonAccount.externalId),
        gte(d.patreonPledges.createdAt, subMonths(new Date(), 1)),
      ),
    });

    if (patreonPledges.length) {
      // Order pledges by tier ID in accordance to env.PATREON_TIERS.
      patreonPledges.sort(
        (a, b) =>
          env.PATREON_TIERS.findIndex((t) => t.id === a.tierId) -
          env.PATREON_TIERS.findIndex((t) => t.id === b.tierId),
      );

      // Only keep the most important pledge.
      const pledge = patreonPledges[0];

      const tierIndex = env.PATREON_TIERS.findIndex(
        (t) => t.id === pledge.tierId,
      );
      if (tierIndex === -1) {
        throw new Error(`Unknown Patreon tier ${pledge.tierId}`);
      }

      return {
        ...env.PATREON_TIERS[tierIndex],
        index: tierIndex,
        activeUntil: addMonths(pledge.createdAt, 1).toString(),
      };
    }
  }

  return null;
}
