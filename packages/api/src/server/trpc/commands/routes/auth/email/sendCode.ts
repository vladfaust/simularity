import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { transporter } from "@/lib/nodemailer.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import { t } from "@/server/trpc.js";
import { wrap } from "@typeschema/valibot";
import { toSeconds } from "duration-fns";
import { customAlphabet } from "nanoid";
import { EmailCodeRedisObject, emailCodeRedisKey } from "./_common.js";

const nanoid = customAlphabet("1234567890", 6);

/**
 * Send a login code to an email.
 */
export default t.procedure
  .input(
    wrap(
      v.object({
        email: v.pipe(v.string(), v.email()),
        nonce: v.optional(v.string()),
      }),
    ),
  )
  .mutation(async ({ input }) => {
    const code = nanoid();

    await redis.set(
      emailCodeRedisKey(code),
      JSON.stringify({
        email: input.email,
        nonce: input.nonce,
      } satisfies EmailCodeRedisObject),
      "EX",
      toSeconds({ minutes: 5 }),
    );

    konsole.debug("Sending code to email", { email: input.email, code });
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: input.email,
      subject: `${code} is your login code`,
      text: `Your login code is ${code}.`,
    });
  });
