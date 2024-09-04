import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { transporter } from "@/lib/nodemailer.js";
import { fetchToken } from "@/lib/oauth.js";
import { redis } from "@/lib/redis.js";
import { unreachable } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import assert from "assert";
import bodyParser from "body-parser";
import cors from "cors";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { createJwt, extractUser } from "../_common.js";
import { OAuthRedisObject, oauthStateRedisKey } from "./_common.js";

const RequestBodySchema = v.object({
  code: v.string(),
  state: v.string(),
  reason: v.picklist(["link", "login"]),
});

const ResponseBodySchema = v.object({
  jwt: v.optional(v.string()),
  returnUrl: v.optional(v.string()),
});

/**
 * OAuth callback, should be called by the frontend after
 * the user is redirected back from the OAuth provider.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/", async (req, res) => {
    const loggedInUser = await extractUser(req);
    if (loggedInUser instanceof Error) return res.status(401);

    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.debug("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const redisObject = await redis
      .getdel(oauthStateRedisKey(body.output.state))
      .then((x) => {
        if (!x) return null;
        return JSON.parse(x) as OAuthRedisObject;
      });

    if (!redisObject) {
      konsole.debug("Invalid state", body.output.state);
      return res.status(400).json({
        error: "Invalid state",
      });
    }

    if (redisObject.reason !== body.output.reason) {
      konsole.debug("Reason mismatch", redisObject.reason, body.output.reason);
      return res.status(400).json({
        error: "Reason mismatch",
      });
    }

    switch (redisObject.reason) {
      case "link":
        if (!loggedInUser) return res.status(401);
        else break;

      case "login":
        break;

      default:
        throw unreachable(redisObject.reason);
    }

    const provider = env.OAUTH_PROVIDERS[redisObject.providerId];

    if (!provider) {
      throw new Error(`Provider "${redisObject.providerId}" not found`);
    }

    const tokenResponse = await fetchToken(
      redisObject.providerId,
      provider,
      {
        code: body.output.code,
        state: body.output.state,
        reason: redisObject.reason,
      },
      true,
    );
    konsole.debug("Token response", tokenResponse);

    const txResult:
      | {
          user: {
            id: string;
            email: string | null;
            justCreated: boolean;
          };
          setCookie: boolean;
        }
      | {
          status: number;
          body: { error: string };
        } = await d.db.transaction(async (tx) => {
      assert(tokenResponse.user);

      let account = await tx.query.oauthAccounts.findFirst({
        where: and(
          eq(d.oauthAccounts.providerId, redisObject.providerId),
          eq(d.oauthAccounts.externalId, tokenResponse.user.id),
        ),
        columns: {},
        with: {
          user: {
            columns: {
              id: true,
              email: true,
            },
          },
        },
      });

      switch (body.output.reason) {
        case "link": {
          if (account) {
            konsole.debug("Account already linked");
            return {
              status: 409,
              body: { error: "Account already linked" },
            };
          }

          assert(loggedInUser);

          const newAccount = (
            await tx
              .insert(d.oauthAccounts)
              .values({
                providerId: redisObject.providerId,
                externalId: tokenResponse.user.id,
                userId: loggedInUser.id,
                tokenType: tokenResponse.tokenType,
                accessToken: tokenResponse.accessToken,
                accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
                refreshToken: tokenResponse.refreshToken,
                refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
                scope: tokenResponse.scope || provider.scope,
              })
              .returning({
                providerId: d.oauthAccounts.providerId,
                externalId: d.oauthAccounts.externalId,
                userId: d.oauthAccounts.userId,
              })
          )[0];

          await onAccountLink(tx, newAccount);

          return {
            user: {
              id: loggedInUser.id,
              email: null,
              justCreated: false,
            },
            setCookie: false,
          };
        }

        case "login": {
          if (account) {
            // Just update existing account.
            //

            await tx
              .update(d.oauthAccounts)
              .set({
                accessToken: tokenResponse.accessToken,
                accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
                refreshToken: tokenResponse.refreshToken,
                refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
                scope: tokenResponse.scope,
              })
              .where(
                and(
                  eq(d.oauthAccounts.providerId, redisObject.providerId),
                  eq(d.oauthAccounts.externalId, tokenResponse.user.id),
                ),
              );

            return {
              user: {
                id: account.user.id,
                email: account.user.email,
                justCreated: false,
              },
              setCookie: true,
            };
          } else {
            // Create new user, and link the account to it.
            //

            const user = (
              await tx
                .insert(d.users)
                .values({ email: tokenResponse.user.email })
                .returning({ id: d.users.id, email: d.users.email })
            )[0];

            const newAccount = (
              await tx
                .insert(d.oauthAccounts)
                .values({
                  providerId: redisObject.providerId,
                  externalId: tokenResponse.user.id,
                  userId: user.id,
                  tokenType: tokenResponse.tokenType,
                  accessToken: tokenResponse.accessToken,
                  accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
                  refreshToken: tokenResponse.refreshToken,
                  refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
                  scope: tokenResponse.scope || provider.scope,
                })
                .returning({
                  providerId: d.oauthAccounts.providerId,
                  externalId: d.oauthAccounts.externalId,
                  userId: d.oauthAccounts.userId,
                })
            )[0];

            await onAccountLink(tx, newAccount);

            return {
              user: {
                id: user.id,
                email: user.email,
                justCreated: true,
              },
              setCookie: true,
            };
          }
        }

        default:
          throw unreachable(body.output.reason);
      }
    });

    if ("status" in txResult) {
      return res.status(txResult.status).json(txResult.body);
    }

    const { user, setCookie } = txResult;

    if (user.justCreated) {
      if (user.email) {
        sendWelcomeEmail(user.email);
      }

      switch (redisObject.providerId) {
        case "patreon": {
          // Maybe update user's display name.
          break;
        }

        default:
          throw unreachable(redisObject.providerId);
      }
    }

    let jwt: string | undefined;
    if (setCookie) {
      jwt = await createJwt(user.id);
    }

    return res.json({
      jwt,
      returnUrl: redisObject.returnUrl,
    } satisfies v.InferOutput<typeof ResponseBodySchema>);
  });

async function sendWelcomeEmail(email: string) {
  transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "Welcome",
    text: "Welcome!",
  });
}

async function onAccountLink(
  tx: typeof d.db,
  account: Pick<
    typeof d.oauthAccounts.$inferSelect,
    "providerId" | "externalId" | "userId"
  >,
) {
  if (account.providerId === "patreon") {
    const orphanPatreonPledges = await tx.query.patreonPledges.findMany({
      where: and(
        eq(d.patreonPledges.patronId, account.externalId),
        isNull(d.patreonPledges.userId),
      ),
      columns: {
        creditsAmount: true,
      },
    });

    if (orphanPatreonPledges.length) {
      const totalCredits = orphanPatreonPledges.reduce(
        (acc, x) => acc + parseFloat(x.creditsAmount),
        0,
      );

      konsole.log(
        `Found ${orphanPatreonPledges.length} orphan Patreon pledge(s) with total credits of ${totalCredits}`,
      );

      await tx.update(d.patreonPledges).set({
        userId: account.userId,
      });

      await tx
        .update(d.users)
        .set({
          creditBalance: sql` ${d.users.creditBalance} + ${totalCredits} `,
        })
        .where(eq(d.users.id, account.userId));

      konsole.log(`Granted ${totalCredits} credits to user: ${account.userId}`);
    }
  }
}
