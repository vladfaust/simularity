import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { transporter } from "@/lib/nodemailer.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { TRPCError } from "@trpc/server";
import { wrap } from "@typeschema/valibot";
import { ExpressContext } from "../../../context.js";
import { setCookie } from "../_common.js";
import { NONCE_TTL, nonceRedisKey } from "../nonce/_common.js";
import { EmailCodeRedisObject, emailCodeRedisKey } from "./_common.js";

/**
 * Log in with an email and a code.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        email: v.pipe(v.string(), v.email()),
        code: v.pipe(v.string(), v.regex(/^\d{6}$/)),
      }),
    ),
  )
  .output(
    wrap(
      v.object({
        userId: v.string(),
        jwt: v.string(),
        cookieMaxAge: v.number(),
        justCreated: v.boolean(),
      }),
    ),
  )
  .mutation(async ({ ctx, input }) => {
    const redisObject = await redis
      .get(emailCodeRedisKey(input.code))
      .then((string): EmailCodeRedisObject | null =>
        string ? JSON.parse(string) : null,
      );

    if (!redisObject) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid or expired code",
      });
    }

    const { user, justCreated } = await d.db.transaction(async (tx) => {
      let justCreated = false;

      let user = await tx.query.users.findFirst({
        where: (user, { eq }) => eq(user.email, input.email),
        columns: { id: true },
      });

      if (!user) {
        user = (
          await tx
            .insert(d.users)
            .values({
              email: input.email,
            })
            .returning({
              id: d.users.id,
            })
        )[0];

        justCreated = true;
      }

      return { user, justCreated };
    });

    if (justCreated) {
      transporter.sendMail({
        from: env.SMTP_FROM,
        to: input.email,
        subject: `Welcome`,
        text: `Welcome!`,
      });
    }

    if (redisObject.nonce) {
      konsole.log(
        "Updating nonce auth",
        nonceRedisKey(redisObject.nonce),
        user.id,
      );

      await redis.set(
        nonceRedisKey(redisObject.nonce),
        user.id,
        "EX",
        NONCE_TTL,
      );
    }

    const { jwt, cookieMaxAge } = await setCookie(
      ctx as ExpressContext,
      user.id,
    );

    return {
      userId: user.id,
      jwt,
      cookieMaxAge,
      justCreated,
    };
  });
