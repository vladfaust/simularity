import { t } from "@/server/trpc.js";

import text2Speech from "./routes/text2Speech.js";
import text2Text from "./routes/text2Text.js";

export const subscriptionsRouter = t.router({
  text2Speech,
  text2Text,
});

export type SubscriptionsRouter = typeof subscriptionsRouter;
