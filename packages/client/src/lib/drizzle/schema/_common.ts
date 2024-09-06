import { sql } from "drizzle-orm";
import { integer } from "drizzle-orm/sqlite-core";

export const SQL_NOW = sql`strftime('%s', 'now')`;

export function timestamp(
  name: string,
  options?: {
    notNull?: boolean;
    defaultNow?: boolean;
  },
) {
  let column = integer(name, { mode: "timestamp" });

  if (options?.notNull) {
    column = column.notNull();
  }

  if (options?.defaultNow) {
    column = column.default(SQL_NOW);
  }

  return column;
}
