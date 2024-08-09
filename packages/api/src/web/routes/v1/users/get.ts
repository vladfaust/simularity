import bodyParser from "body-parser";
import cors from "cors";
import { Router } from "express";
import { ensureUser } from "../auth/common.js";

/**
 * Get current user.
 */
export default Router()
  .use(cors())
  .use(bodyParser.json())
  .get("/", async (req, res) => {
    const user = await ensureUser(req, res);
    if (!user) return res.sendStatus(401);

    return res.json({
      id: user.id,
      username: user.username,
    });
  });
