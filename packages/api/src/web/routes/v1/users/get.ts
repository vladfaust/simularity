import { v } from "@/lib/valibot.js";
import { ResponseSchema } from "@simularity/api-sdk/v1/users/get";
import bodyParser from "body-parser";
import cors from "cors";
import { Router } from "express";
import { extractUser } from "../auth/_common.js";

/**
 * Get current user.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .get("/", async (req, res) => {
    const user = await extractUser(req);
    if (!user || user instanceof Error) return res.sendStatus(401);

    return res.json({
      id: user.id,
      email: user.email,
      creditBalance: user.creditBalance,
    } satisfies v.InferOutput<typeof ResponseSchema>);
  });
