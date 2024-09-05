import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { v } from "@/lib/valibot.js";
import { ResponseSchema } from "@simularity/api-sdk/v1/account";
import bodyParser from "body-parser";
import cors from "cors";
import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { extractUser } from "../auth/_common.js";

/**
 * Get the account details of the current user.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .get("/", async (req, res) => {
    const user = await extractUser(req);
    if (!user || user instanceof Error) return res.sendStatus(401);

    const oauthAccounts = await d.db.query.oauthAccounts.findMany({
      where: eq(d.oauthAccounts.userId, user.id),
    });

    const patreonAccount = oauthAccounts.find(
      (acc) => acc.providerId === "patreon",
    );

    let patreonTier = null;
    if (patreonAccount) {
      const patreonPledges = await d.db.query.patreonPledges.findMany({
        where: and(
          eq(d.patreonPledges.patronId, patreonAccount.externalId),
          // gte(d.patreonPledges.createdAt, subMonths(new Date(), 1)),
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
        patreonTier = {
          name: env.PATREON_TIERS.find(
            (t) => t.id === patreonPledges[0].tierId,
          )!.name,
          activeUntil: addMonths(patreonPledges[0].createdAt, 1).toString(),
        };
      }
    }

    return res.json({
      id: user.id,
      email: user.email,
      oAuthAccounts: {
        patreon: patreonAccount ? { tier: patreonTier } : null,
      },
    } satisfies v.InferInput<typeof ResponseSchema>);
  });
