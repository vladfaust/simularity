import { d } from "@/lib/drizzle.js";
import { redis } from "@/lib/redis.js";
import { v } from "@/lib/valibot.js";
import cors from "cors";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { inferenceNodeKey } from "../inferenceNodes/common.js";

// TODO: Session TTL.
export default Router()
  .use(cors())
  .head("/gpts/:gptSessionId", async (req, res) => {
    const gptSessionId = v.safeParse(
      v.pipe(v.string(), v.uuid()),
      req.params.gptSessionId,
    );

    if (!gptSessionId.success) {
      return res.status(400).send("Invalid GPT session ID");
    }

    const gptSession = await d.db.query.gptSessions.findFirst({
      where: and(
        eq(d.gptSessions.id, gptSessionId.output),
        isNull(d.gptSessions.deletedAt),
      ),
    });

    if (!gptSession) {
      return res.status(404).send("GPT session not found");
    }

    // Check inference node availability.
    if (!(await redis.exists(inferenceNodeKey(gptSession.inferenceNodeId)))) {
      return res.status(503).send("Inference node not available");
    }

    // TODO: Check the session TTL.

    res.sendStatus(200);
  });
