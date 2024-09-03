import {
  decimal,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email"),

    creditBalance: decimal("credit_balance", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIndex: unique("users_email_index").on(table.email),
    createdAtIndex: index("users_created_at_index").on(table.createdAt),
  }),
);
