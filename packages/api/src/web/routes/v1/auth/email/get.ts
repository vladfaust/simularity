import { env } from "@/env.js";
import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { transporter } from "@/lib/nodemailer.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import cors from "cors";
import { Router } from "express";
import { createJwt } from "../_common.js";
import { NONCE_TTL, nonceRedisKey } from "../nonce/_common.js";
import { EmailCodeRedisObject, emailCodeRedisKey } from "./_common.js";

const EmailSchema = v.pipe(v.string(), v.email());
const CodeSchema = v.pipe(v.string(), v.regex(/^\d{6}$/));

/**
 * Get an email auth gated with a code, effectively logging in.
 * Code lives only for one use.
 * @example GET /v1/auth/email/foo@example.com?code=123456
 */
export default Router()
  .use(cors())
  .get("/:email", async (req, res) => {
    konsole.log("GET /v1/auth/email/:email", req.params.email, req.query.code);

    const email = v.safeParse(EmailSchema, req.params.email);
    if (!email.success) {
      konsole.debug("Invalid email", v.flatten(email.issues));
      return res.status(400).json({
        error: "Invalid email",
        issues: v.flatten(email.issues),
      });
    }

    const code = v.safeParse(CodeSchema, req.query.code);
    if (!code.success) {
      konsole.debug("Invalid code", v.flatten(code.issues));
      return res.status(400).json({
        error: "Invalid code",
        issues: v.flatten(code.issues),
      });
    }

    const redisObject = await redis
      .get(emailCodeRedisKey(code.output))
      .then((string): EmailCodeRedisObject | null =>
        string ? JSON.parse(string) : null,
      );

    if (!redisObject) {
      return res.status(401).json({
        error: "Invalid or expired code",
      });
    }

    const { user, justCreated } = await d.db.transaction(async (tx) => {
      let justCreated = false;

      let user = await tx.query.users.findFirst({
        where: (user, { eq }) => eq(user.email, email.output),
        columns: { id: true },
      });

      if (!user) {
        user = (
          await tx
            .insert(d.users)
            .values({
              email: email.output,
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
        to: email.output,
        subject: `Welcome`,
        text: `Welcome!`,
      });
    }

    const jwt = await createJwt(user.id);

    if (redisObject.nonce) {
      konsole.log("Updating nonce auth", redisObject.nonce);
      await redis.set(nonceRedisKey(redisObject.nonce), jwt, "EX", NONCE_TTL);
    }

    res.json({ jwt, justCreated });
  });
