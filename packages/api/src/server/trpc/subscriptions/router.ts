import { t } from "@/server/trpc.js";

import text2Text from "./routes/text2Text.js";

export const subscriptionsRouter = t.router({
  text2Text,
});

export type SubscriptionsRouter = typeof subscriptionsRouter;
