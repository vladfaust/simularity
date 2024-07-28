import { sqlite } from "@/lib/drizzle.js";
import { assert, sql } from "@/lib/utils.js";

// ADHOC: `upClient` and `downClient` methods.
export type Migration = {
  name: string;
} & (
  | { up: () => string }
  | { upClient: (client: typeof sqlite) => Promise<void> }
) &
  (
    | { down: () => string }
    | { downClient: (client: typeof sqlite) => Promise<void> }
  );

/**
 * Run migrations.
 *
 * @param migrations - The migrations array to run.
 * @param kvTable - The key-value table name to store the current migration index.
 * Will be created if it doesn't exist yet.
 * @param currentMigrationKey - The key to store the current migration index.
 * @param toIndex - The target migration index.
 *
 * @returns The number of applied migrations.
 *
 * @example
 * migrate() // Migrate to the latest migration.
 * migrate(0) // Migrate to the first migration.
 * // migrate(-1) // Error! If you want to drop all tables,
 *                // delete the database file instead.
 */
// REFACTOR: `Migration` class w/ `up(tx: d.Transaction): Promise<void>` method.
export async function migrate(
  migrations: Migration[],
  kvTable: string,
  currentMigrationKey: string,
  toIndex: number,
): Promise<number> {
  console.debug(`migrate(toIndex: ${toIndex})`);

  assert(Number.isInteger(toIndex), "toIndex must be an integer");
  assert(toIndex >= 0, "toIndex must be >= 0");
  assert(toIndex < migrations.length, `toIndex must be < ${migrations.length}`);

  await sqlite.execute("BEGIN");
  let migrationsRun = 0;

  try {
    const to = migrations.at(toIndex);
    if (!to) throw new Error(`Migration not found at index ${toIndex}`);

    console.debug("Create KV table if it doesn't exist yet...");
    await sqlite.execute(sql`
      CREATE TABLE IF NOT EXISTS "${kvTable}" ("key" VARCHAR(255) PRIMARY KEY, "value" TEXT);
    `);

    console.debug("Get current migration index...");
    const queryResult = await sqlite.query(sql`
      SELECT
        cast("value" AS INTEGER) AS "index"
      FROM
        "${kvTable}"
      WHERE
        "key" = '${currentMigrationKey}'
    `);
    let fromIndex = (queryResult.rows as number[][]).at(0)?.[0];

    if (fromIndex === toIndex) {
      console.log(`Already at index ${toIndex}, nothing to do.`);
      await sqlite.execute("ROLLBACK");
      return 0;
    }

    fromIndex = fromIndex ?? -1;
    const isUp = toIndex >= fromIndex;

    console.log(
      `Will migrate ${isUp ? "up" : "down"} from ${fromIndex === -1 ? "scratch" : migrations[fromIndex].name} to ${to.name}...`,
    );

    for (const migration of isUp
      ? migrations.slice(fromIndex + 1, toIndex + 1)
      : migrations.slice(toIndex + 1, fromIndex + 1).reverse()) {
      console.debug(`Migrate ${isUp ? "up" : "down"} ${migration.name}...`);

      if (isUp) {
        if ("upClient" in migration) {
          await migration.upClient(sqlite);
        } else {
          await sqlite.executeBatch(migration.up());
        }
      } else {
        if ("downClient" in migration) {
          await migration.downClient(sqlite);
        } else {
          await sqlite.executeBatch(migration.down());
        }
      }

      migrationsRun++;
    }

    await sqlite.execute(sql`
      INSERT INTO
        "${kvTable}" ("key", "value")
      VALUES
        (
          '${currentMigrationKey}',
          cast(${toIndex} AS TEXT)
        )
      ON CONFLICT ("key") DO
      UPDATE
      SET
        "value" = cast(${toIndex} AS TEXT)
    `);
  } catch (e) {
    await sqlite.execute("ROLLBACK");
    throw e;
  }

  await sqlite.execute("COMMIT");
  return migrationsRun;
}
