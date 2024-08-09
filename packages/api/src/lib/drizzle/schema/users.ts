import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    username: varchar("username").notNull(),
    passwordHash: varchar("password_hash").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    usernameIndex: index("users_username_index").on(table.username),
    createdAtIndex: index("users_created_at_index").on(table.createdAt),
  }),
);
