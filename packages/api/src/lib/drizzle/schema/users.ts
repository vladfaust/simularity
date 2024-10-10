import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { bytea } from "./common";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email"),

    username: varchar("username"),
    bio: text("bio").notNull().default(""),

    pfpHash: bytea("pfp_hash"),
    pfpExtension: varchar("pfp_extension"),

    bgpHash: bytea("bgp_hash"),
    bgpExtension: varchar("bgp_extension"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIndex: unique("users_email_index").on(table.email),
    createdAtIndex: index("users_created_at_index").on(table.createdAt),
  }),
);
