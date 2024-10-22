import { PlatformId } from "@/lib/schema";
import {
  json,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const releases = pgTable("releases", {
  id: serial("id").primaryKey(),

  versionMajor: smallint("version_major").notNull(),
  versionMinor: smallint("version_minor").notNull(),
  versionPatch: smallint("version_patch").notNull(),

  notes: text("notes"),
  platforms: json("platforms")
    .$type<
      Record<
        PlatformId,
        {
          s3ObjectKey: string;
          s3ObjectVersion?: string;
          signature: string;
        }
      >
    >()
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
