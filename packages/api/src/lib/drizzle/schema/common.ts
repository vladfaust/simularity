import { customType } from "drizzle-orm/pg-core";

/**
 * PostgreSQL `bytea` type.
 */
export const bytea = customType<{
  data: Buffer;
}>({
  dataType() {
    return "bytea";
  },
});
