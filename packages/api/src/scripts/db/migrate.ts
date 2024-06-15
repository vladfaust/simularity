import { pg as sql } from "@/lib/pg.js";
import fs from "fs";
import path from "path";

/**
 * Run migrations.
 *
 * @param toFilename The start of a filename to migrate to.
 * If not specified, the latest migration file will be used.
 * @param baseDir The directory to look for migration files in.
 * @param migrationTable The name of the migration table, defaults to `_migrations`.
 *
 * @example ```js
 * // db/migrations/001-create-users.js
 * export function up(sql) {
 *   sql`
 *     CREATE TABLE IF NOT EXISTS "users" (
 *       "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7 () NOT NULL,
 *       "email" TEXT NOT NULL,
 *       "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
 *       "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
 *       CONSTRAINT "users_email_unique" UNIQUE ("email")
 *     );
 *   `;
 * }
 *
 * export function down(sql) {
 *   sql` DROP TABLE IF EXISTS "users"; `;
 * }
 * ```
 *
 * @example ```sh
 * npm run db:migrate
 * # Or:
 * npm run db:migrate 001 ./db/migrations _migrations
 * ```
 */
export async function migrate(
  toFilename?: string,
  baseDir: string = "./db/migrations",
  migrationTable: string = "_migrations",
) {
  console.debug({ toFilename, baseDir, migrationTable });

  console.debug("Create migration table if it doesn't exist...");
  await sql`
    CREATE TABLE IF NOT EXISTS ${sql(migrationTable)} (
      "id" serial PRIMARY KEY,
      "filename" VARCHAR(255) NOT NULL UNIQUE,
      "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `;

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
  console.debug({ from });

  const dirPath = path.join(process.cwd(), baseDir);
  const filenames = fs.readdirSync(dirPath);
  console.debug({ fileNames: filenames });

  if (toFilename) {
    const found = filenames.filter((filename) =>
      filename.startsWith(toFilename!),
    );

    if (found.length === 0) {
      throw new Error(`No migration file found for ${toFilename}`);
    } else if (found.length > 1) {
      throw new Error(`Multiple migration files found for ${toFilename}`);
    } else {
      toFilename = found[0];
    }
  } else {
    toFilename = filenames[filenames.length - 1];
  }

  if (from?.filename === toFilename) {
    console.log(`Already at ${toFilename}, exiting`);
    process.exit(0);
  }

  console.debug("Get existing target migration by filename, if any...");
  const to = (
    await sql<[{ id: number; filename: string }]>`
      SELECT
        "id",
        "filename"
      FROM
        ${sql(migrationTable)}
      WHERE
        "filename" = ${toFilename}
    `
  ).at(0);
  console.debug({ to });

  const isUp = to === undefined ? true : to.id > (from?.id ?? 0);
  console.log(
    `Will migrate ${
      isUp ? "up" : "down"
    } from ${from?.filename} to ${toFilename}...`,
  );

  const fromIndex = from ? filenames.indexOf(from.filename) + 1 : 0;
  const toIndex = filenames.indexOf(toFilename);

  let i = 0;
  for (const fileName of isUp
    ? filenames.slice(fromIndex, toIndex + 1)
    : filenames.slice(toIndex + 1, fromIndex).reverse()) {
    const filePath = path.join(dirPath, fileName);

    console.debug(`Migrate ${isUp ? "up" : "down"} ${filePath}...`);
    const { up, down } = await import(filePath);

    await sql.begin(async (sql) => {
      await (isUp ? up(sql.unsafe) : down(sql.unsafe));

      await sql`
        ${isUp
          ? sql`
              INSERT INTO
                ${sql(migrationTable)} ("id", "filename", "applied_at")
              VALUES
                (DEFAULT, ${fileName}, now())
            `
          : sql`
              DELETE FROM ${sql(migrationTable)}
              WHERE
                "id" = (
                  SELECT
                    max("id")
                  FROM
                    ${sql(migrationTable)}
                )
            `}
      `;
    });

    i++;
  }

  if (toIndex === 0) {
    await sql`DROP TABLE ${sql(migrationTable)}`;
  }

  console.log(`Successfully run ${i} migrations`);
}

try {
  await migrate(...process.argv.slice(2));
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
