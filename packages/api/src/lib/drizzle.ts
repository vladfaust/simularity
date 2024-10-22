import { drizzle as drizzleDb } from "drizzle-orm/postgres-js";
import * as schema from "./drizzle/schema.js";
import { pg } from "./pg.js";
import { pick } from "./utils.js";

export const d = {
  db: drizzleDb(pg, { schema }),
  ...pick(schema, [
    "llmCompletions",
    "llmModels",
    "llmSessions",
    "llmWorkers",
    "oauthAccounts",
    "patreonPledges",
    "releases",
    "scenarios",
    "subscriptions",
    "ttsInferences",
    "ttsModels",
    "ttsWorkers",
    "users",
  ]),
};
