import { OAuthProviderIdSchema } from "@/lib/oauth.js";
import { relations } from "drizzle-orm";
import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    // The provider ID, e.g. "google".
    providerId: varchar("provider_id", {
      enum: OAuthProviderIdSchema.options,
      length: 32,
    }).notNull(),

    externalId: text("external_id").notNull(), // The user's ID with the provider.

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    scope: text("scope").notNull(),

    /**
     * The type of token, e.g. "Bearer".
     */
    tokenType: text("token_type").notNull(),

    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),

    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),

    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.externalId] }),
  }),
);

export const oauthAccountRelations = relations(
  oauthAccounts,
  ({ one, many }) => ({
    user: one(users, {
      fields: [oauthAccounts.userId],
      references: [users.id],
    }),
  }),
);
