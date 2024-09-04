import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { PledgeSchema } from "@/lib/patreon/schema.js";
import { unreachable } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { Request, Response, Router } from "express";

// See https://docs.patreon.com/#webhooks.
//
// For future reference:
//
// - https://www.patreondevelopers.com/t/how-i-am-consuming-webhooks-to-drive-website-logic/8646
// - https://www.patreondevelopers.com/t/webhooks-general-questions/2332
//

const RequestBodySchema = v.object({
  data: PledgeSchema,
});

const EventSchema = v.picklist([
  "pledges:create",
  "pledges:update",
  "pledges:delete",
]);

/**
 * @author https://stackoverflow.com/a/35651853/3645337.
 */
var rawBodySaver = function (
  req: Request,
  res: Response,
  buf: Buffer,
  encoding?: string,
) {
  if (buf && buf.length) {
    (req as any).rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
  }
};

/**
 * `POST /v1/patreon/webhook`.
 * Disabled if {@link env.PATREON_WEBHOOK_SECRET} is not set.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json({ verify: rawBodySaver }))
  .post("/", async (req, res) => {
    // Extract the event type.
    //

    const eventRaw = req.header("X-Patreon-Event");
    if (!eventRaw) {
      konsole.log("Missing X-Patreon-Event header");
      return res.status(400).json({
        error: "Missing X-Patreon-Event header",
      });
    }
    const eventParsed = v.safeParse(EventSchema, eventRaw);
    if (!eventParsed.success) {
      konsole.log("Invalid X-Patreon-Event header", eventParsed.issues);
      return res.status(400).json({
        error: "Invalid X-Patreon-Event header",
      });
    }
    const event = eventParsed.output;

    // Validate the signature.
    //

    const signature = req.header("X-Patreon-Signature");
    if (!signature) {
      konsole.log("Missing X-Patreon-Signature header");
      return res.status(400).json({
        error: "Missing X-Patreon-Signature header",
      });
    }
    konsole.debug("Patreon webhook signature", signature);

    if (!env.PATREON_WEBHOOK_SECRET) {
      throw new Error(
        "Missing PATREON_WEBHOOK_SECRET (endpoint MUST be disabled)",
      );
    }

    const hash = crypto
      .createHmac("md5", env.PATREON_WEBHOOK_SECRET)
      .update((req as any).rawBody)
      .digest("hex");

    if (signature !== hash) {
      konsole.log("Invalid X-Patreon-Signature header");
      return res.status(400).json({
        error: "Invalid X-Patreon-Signature header",
      });
    }

    // Parse the request body.
    //

    const bodyParsed = v.safeParse(RequestBodySchema, req.body);
    if (!bodyParsed.success) {
      konsole.warn(
        "Invalid request body",
        JSON.stringify(req.body, null, 2),
        v.flatten(bodyParsed.issues),
      );

      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(bodyParsed.issues),
      });
    }
    const body = bodyParsed.output;

    // All good.
    //

    konsole.log("Patreon webhook", event, body);

    switch (event) {
      case "pledges:create": {
        switch (body.data.attributes.status) {
          case undefined:
            konsole.log('Special case: status is `undefined`, deemed "valid"');
          case "valid": {
            if (body.data.attributes.currency !== "USD") {
              throw new Error(
                `Unsupported currency: ${body.data.attributes.currency}`,
              );
            }

            // 1 USD = 100 credits.
            const creditsAmount = body.data.attributes.amount_cents * 1;

            await d.db.transaction(async (tx) => {
              let patreonPledge = await tx.query.patreonPledges.findFirst({
                where: eq(d.patreonPledges.id, body.data.id),
                columns: { id: true },
              });

              if (patreonPledge) {
                konsole.warn(`Pledge already exists: ${patreonPledge.id}`);
                return;
              }

              const oauthAccount = await tx.query.oauthAccounts.findFirst({
                where: and(
                  eq(d.oauthAccounts.providerId, "patreon"),
                  eq(
                    d.oauthAccounts.externalId,
                    body.data.relationships.patron.data.id,
                  ),
                ),
                columns: {
                  userId: true,
                },
              });

              if (oauthAccount) {
                konsole.debug(
                  `Found user for Patreon patron: ${oauthAccount.userId}`,
                );
              } else {
                konsole.debug("Patreon patron not found in system");
              }

              patreonPledge = (
                await tx
                  .insert(d.patreonPledges)
                  .values({
                    id: body.data.id,
                    campaignId: body.data.relationships.campaign.data.id,
                    tierId: body.data.relationships.reward.data.id,
                    patronId: body.data.relationships.patron.data.id,
                    userId: oauthAccount?.userId,
                    amountCents: body.data.attributes.amount_cents,
                    currency: body.data.attributes.currency,
                    creditsAmount: creditsAmount.toString(),
                    createdAt: body.data.attributes.created_at,
                  })
                  .returning({
                    id: d.patreonPledges.id,
                  })
              )[0];

              konsole.log(`Created Patreon pledge`, patreonPledge);

              if (oauthAccount) {
                konsole.log(
                  `Granting ${creditsAmount} credits to user: ${oauthAccount.userId}`,
                );

                await tx
                  .update(d.users)
                  .set({
                    creditBalance: sql`
                      ${d.users.creditBalance} + ${creditsAmount}
                    `,
                  })
                  .where(eq(d.users.id, oauthAccount.userId));
              } else {
                konsole.log(
                  `Pledge not associated with any user yet: ${patreonPledge.id}`,
                );
              }
            });

            break;
          }

          case "pending":
          case "disabled":
          case "declined":
            konsole.log(`Pledge ignored: ${body.data.attributes.status}`);
            break;

          default:
            throw unreachable(body.data.attributes.status);
        }

        break;
      }

      case "pledges:update":
      case "pledges:delete":
        konsole.log(`Pledge ignored: ${event}`);
        break;

      default:
        throw unreachable(event);
    }

    res.sendStatus(200);
  });
