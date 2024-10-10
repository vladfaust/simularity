import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { transporter } from "@/lib/nodemailer.js";
import { fetchToken } from "@/lib/oauth.js";
import { redis } from "@/lib/redis.js";
import { unreachable } from "@/lib/utils.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { TRPCError } from "@trpc/server";
import { wrap } from "@typeschema/valibot";
import assert from "assert";
import { addMonths } from "date-fns";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ExpressContext } from "../../../context.js";
import { setCookie } from "../_common.js";
import { OAuthRedisObject, oauthStateRedisKey } from "./_common.js";

/**
 * OAuth callback, should be called by the frontend after
 * the user is redirected back from the OAuth provider.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        code: v.string(),
        state: v.string(),
        reason: v.picklist(["link", "login"]),
      }),
    ),
  )
  .output(
    wrap(
      v.object({
        userId: v.optional(v.string()),
        cookieMaxAge: v.optional(v.number()),
        returnUrl: v.optional(v.string()),
      }),
    ),
  )
  .mutation(async ({ ctx, input }) => {
    const redisObject = await redis
      .getdel(oauthStateRedisKey(input.state))
      .then((x) => {
        if (!x) return null;
        return JSON.parse(x) as OAuthRedisObject;
      });

    if (!redisObject) {
      konsole.debug("Invalid state", input.state);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid state",
      });
    }

    if (redisObject.reason !== input.reason) {
      konsole.debug("Reason mismatch", redisObject.reason, input.reason);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Reason mismatch",
      });
    }

    switch (redisObject.reason) {
      case "link":
        if (!ctx.userId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
          });
        }

        break;

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
        code: input.code,
        state: input.state,
        reason: redisObject.reason,
      },
      true,
    );
    konsole.debug("Token response", tokenResponse);

    const txResult: {
      user: {
        id: string;
        email: string | null;
        justCreated: boolean;
      };
      setCookie: boolean;
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

      switch (input.reason) {
        case "link": {
          if (account) {
            konsole.debug("Account already linked");
            throw new TRPCError({
              code: "CONFLICT",
              message: "Account already linked",
            });
          }

          assert(ctx.userId);

          const newAccount = (
            await tx
              .insert(d.oauthAccounts)
              .values({
                providerId: redisObject.providerId,
                externalId: tokenResponse.user.id,
                userId: ctx.userId,
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
              id: ctx.userId,
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
          throw unreachable(input.reason);
      }
    });

    const { user, setCookie: shouldSetCookie } = txResult;

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

    let cookieMaxAge: number | undefined;
    if (shouldSetCookie) {
      cookieMaxAge = setCookie(ctx as ExpressContext, user.id);
    }

    return {
      userId: user.id,
      cookieMaxAge,
      returnUrl: redisObject.returnUrl,
    };
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
    });

    if (orphanPatreonPledges.length) {
      konsole.log(
        `Found ${orphanPatreonPledges.length} orphan Patreon pledge(s)`,
      );

      for (const pledge of orphanPatreonPledges) {
        if (pledge.createdAt < addMonths(new Date(), -1)) {
          konsole.warn(`Orphan pledge is older than 1 month, skipping`, {
            pledgeId: pledge.id,
          });

          continue;
        }

        const patreonTierId = pledge.tierId;
        const patreonTier = env.PATREON_TIERS.find(
          (t) => t.id === patreonTierId,
        );

        if (!patreonTier) {
          konsole.warn(`Unknown Patreon tier in orphan pledge, skipping`, {
            patreonTierId,
            pledgeId: pledge.id,
          });

          continue;
        }

        const subscription = (
          await tx
            .insert(d.subscriptions)
            .values({
              userId: account.userId,
              tier: patreonTier.subscriptionTier,
              patreonPledgeId: pledge.id,
              activeUntil: addMonths(pledge.createdAt, 1),
              createdAt: sql`now()`,
            })
            .returning({
              id: d.subscriptions.id,
              tier: d.subscriptions.tier,
              activeUntil: d.subscriptions.activeUntil,
            })
        )[0];

        konsole.log(`Granted subscription to user`, {
          userId: account.userId,
          subscription,
        });
      }

      await tx.update(d.patreonPledges).set({
        userId: account.userId,
      });
    }
  }
}
