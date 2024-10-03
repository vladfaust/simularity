import { env } from "@/env.js";
import { Router } from "express";

import patreonWebhook from "./patreon/webhook.js";

const router = Router();

if (env.PATREON_WEBHOOK_SECRET) {
  router.use("/webhook", patreonWebhook);
}

export default router;
