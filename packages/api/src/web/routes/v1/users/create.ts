import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { v } from "@/lib/valibot.js";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { createJwt } from "../auth/common.js";

const RequestBodySchema = v.object({
  username: v.string(),
  password: v.string(),
});

/**
 * Create a new user.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .post("/", async (req, res) => {
    const body = v.safeParse(RequestBodySchema, req.body);
    if (!body.success) {
      konsole.log("Invalid request body", v.flatten(body.issues));
      return res.status(400).json({
        error: "Invalid request body",
        issues: v.flatten(body.issues),
      });
    }

    const existingUser = await d.db.query.users.findFirst({
      where: eq(d.users.username, body.output.username),
      columns: { id: true },
    });

    if (existingUser) {
      return res.status(419).json({
        error: "Username already exists",
      });
    }

    // Use bcrypt to hash the password.
    const passwordHash = await bcrypt.hash(body.output.password, 10);

    const newUser = (
      await d.db
        .insert(d.users)
        .values({
          username: body.output.username,
          passwordHash,
        })
        .returning({ id: d.users.id })
    )[0];

    return res.status(201).json({
      jwt: await createJwt(newUser.id),
    });
  });
