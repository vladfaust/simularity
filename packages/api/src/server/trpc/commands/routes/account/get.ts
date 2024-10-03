import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { protectedProcedure } from "@/server/trpc/middleware/auth.js";
import { wrap } from "@typeschema/valibot";
import { addMonths, subMonths } from "date-fns";
import { and, eq, gte } from "drizzle-orm";

/**
 * Get the account details of the current user.
 */
export default protectedProcedure
  .output(
    wrap(
      v.object({
        id: v.string(),
        email: v.optional(v.nullable(v.string())),

        oAuthAccounts: v.object({
          patreon: v.nullable(
            v.object({
              tier: v.nullable(
                v.object({
                  name: v.string(),
                  activeUntil: v.pipe(
                    v.string(),
                    v.transform((s) => new Date(s)),
                  ),
                }),
              ),
            }),
          ),
        }),
      }),
    ),
  )
  .query(async ({ ctx }) => {
    const user = await d.db.query.users.findFirst({
      where: eq(d.users.id, ctx.userId),
    });

    if (!user) {
      throw new Error(`User not found in database: ${ctx.userId}`);
    }

    const oauthAccounts = await d.db.query.oauthAccounts.findMany({
      where: eq(d.oauthAccounts.userId, ctx.userId),
    });

    const patreonAccount = oauthAccounts.find(
      (acc) => acc.providerId === "patreon",
    );

    let patreonTier = null;
    if (patreonAccount) {
      const conditions = [
        eq(d.patreonPledges.patronId, patreonAccount.externalId),
      ];

      if (env.NODE_ENV === "production") {
        conditions.push(
          gte(d.patreonPledges.createdAt, subMonths(new Date(), 1)),
        );
      }

      const patreonPledges = await d.db.query.patreonPledges.findMany({
        where: and(...conditions),
      });

      if (patreonPledges.length) {
        // Order pledges by tier ID in accordance to env.PATREON_TIERS.
        patreonPledges.sort(
          (a, b) =>
            env.PATREON_TIERS.findIndex((t) => t.id === a.tierId) -
            env.PATREON_TIERS.findIndex((t) => t.id === b.tierId),
        );

        // Only keep the most important pledge.
        patreonTier = {
          name: env.PATREON_TIERS.find(
            (t) => t.id === patreonPledges[0].tierId,
          )!.name,
          activeUntil: addMonths(patreonPledges[0].createdAt, 1).toString(),
        };
      }
    }

    return {
      id: user.id,
      email: user.email,
      oAuthAccounts: {
        patreon: patreonAccount ? { tier: patreonTier } : null,
      },
    };
  });
