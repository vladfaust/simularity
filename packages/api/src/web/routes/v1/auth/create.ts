import { d } from "@/lib/drizzle.js";
import { konsole } from "@/lib/konsole.js";
import { v } from "@/lib/valibot.js";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { createJwt } from "./common.js";

const RequestBodySchema = v.object({
  username: v.string(),
  password: v.string(),
});

/**
 * Create a new auth, i.e. login.
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

    const user = await d.db.query.users.findFirst({
      where: eq(d.users.username, body.output.username),
      columns: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    // Use bcrypt to compare the password hash.
    if (!(await bcrypt.compare(body.output.password, user.passwordHash))) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    return res.status(201).json({
      jwt: await createJwt(user.id),
    });
  });
