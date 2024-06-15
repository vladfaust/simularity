import { pg as sql } from "@/lib/pg.js";

/**
 * Get the current migration, if any.
 */
export async function get(
  baseDir: string = "./db/migrations",
  migrationTable = "_migrations",
) {
  console.debug("args", { baseDir, migrationTable });

  let result = await sql`
    SELECT
      EXISTS (
        SELECT
          1
        FROM
          pg_tables
        WHERE
          schemaname = 'public'
          AND tablename = ${migrationTable}
      )
  `;

  if (!result[0].exists) {
    return undefined;
  }

  result = await sql`
    SELECT
      "id",
      "filename",
      "applied_at"
    FROM
      ${sql(migrationTable)}
    ORDER BY
      "id" DESC
    LIMIT
      1
  `;

  if (result.count === 0) {
    return undefined;
  } else {
    return result[0];
  }
}

try {
  const out = await get(...process.argv.slice(2));

  if (out) {
    console.info(out);
  } else {
    console.info("No migrations applied yet");
  }

  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
