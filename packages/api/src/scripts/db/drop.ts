import { pg as sql } from "@/lib/pg.js";
import fs from "node:fs";
import path from "node:path";

/**
 * Migrate down to zero.
 *
 * @param baseDir The directory to look for migration files in.
 * @param migrationTable The name of the migration table, defaults to `_migrations`.
 *
 * @example ```js
 * // db/migrations/001-create-users.js
 * export function down(sql) {
 *   sql` DROP TABLE IF EXISTS "users"; `;
 * }
 * ```
 *
 * @example ```sh
 * npm run db:drop
 * # Or:
 * npm run db:drop ./db/migrations _migrations
 * ```
 */
export async function drop(
  baseDir: string = "./db/migrations",
  migrationTable: string = "_migrations",
) {
  console.debug({ baseDir, migrationTable });

  console.debug("Check if migrations table exists...");
  let check = await sql`
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

  if (!check[0].exists) {
    console.log("No migrations applied yet, exiting");
    process.exit(0);
  }

  console.debug("Get current migration, if any...");
  const from = (
    await sql<[{ id: number; filename: string }]>`
      SELECT
        "id",
        "filename"
      FROM
        ${sql(migrationTable)}
      ORDER BY
        "id" DESC
      LIMIT
        1
    `
  ).at(0);
  if (!from) {
    console.log("No migrations applied yet, exiting");
    process.exit(0);
  }
  console.debug({ from });

  const dirPath = path.join(process.cwd(), baseDir);
  const filenames = fs.readdirSync(dirPath);
  console.debug({ fileNames: filenames });

  console.log(`Will migrate down from ${from.filename} to zero...`);

  const fromIndex = from ? filenames.indexOf(from.filename) + 1 : 0;

  let i = 0;
  for (const fileName of filenames.slice(0, fromIndex).reverse()) {
    const filePath = path.join(dirPath, fileName);

    console.debug(`Migrate down ${filePath}...`);
    const { down } = await import(filePath);

    await sql.begin(async (sql) => {
      await down(sql.unsafe);

      await sql`
        DELETE FROM ${sql(migrationTable)}
        WHERE
          "id" = (
            SELECT
              max("id")
            FROM
              ${sql(migrationTable)}
          )
      `;
    });

    i++;
  }

  console.log(`Successfully run ${i} migrations`);

  console.debug("Drop migration table...");
  await sql`DROP TABLE ${sql(migrationTable)}`;
  console.log("Successfully dropped migration table");
}

try {
  await drop(...process.argv.slice(2));
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
