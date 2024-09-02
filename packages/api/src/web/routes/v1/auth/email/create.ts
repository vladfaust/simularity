import { env } from "@/env.js";
import { konsole } from "@/lib/konsole.js";
import { transporter } from "@/lib/nodemailer.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import bodyParser from "body-parser";
import cors from "cors";
import { toSeconds } from "duration-fns";
import { Router } from "express";
import { customAlphabet } from "nanoid";
import { EmailCodeRedisObject, emailCodeRedisKey } from "./_common.js";

const nanoid = customAlphabet("1234567890", 6);

const RequestBodySchema = v.object({
  email: v.pipe(v.string(), v.email()),
  nonce: v.optional(v.string()),
});

export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/", async (req, res) => {
    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.debug("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const code = nanoid();
    await redis.set(
      emailCodeRedisKey(code),
      JSON.stringify({
        email: body.output.email,
        nonce: body.output.nonce,
      } satisfies EmailCodeRedisObject),
      "EX",
      toSeconds({ minutes: 5 }),
    );

    konsole.debug("Sending code to email", { email: body.output.email, code });
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: body.output.email,
      subject: `${code} is your login code`,
      text: `Your login code is ${code}.`,
    });

    return res.sendStatus(201);
  });
