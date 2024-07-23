import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { InferSelectModel } from "drizzle-orm";
import { SQLiteTable, TableConfig } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./drizzle/schema";
import { Migration, migrate as migrate_ } from "./drizzle/scripts/migrate.js";
import { Sqlite, queryResultToObjects } from "./tauri/sqlite";
import { pick } from "./utils";

const MIGRATIONS_TABLE = "meta";
const MIGRATIONS_KEY = "current_migration_index";

const MIGRATIONS: Migration[] = [
  await import("./drizzle/migrations/000_create_simulations.js"),
  await import("./drizzle/migrations/001_create_llama_inferences.js"),
  await import("./drizzle/migrations/002_create_story_updates.js"),
  await import("./drizzle/migrations/003_create_code_updates.js"),
  await import(
    "./drizzle/migrations/004_add_created_by_player_to_story_updates.js"
  ),
  await import("./drizzle/migrations/005_add_simulation_head_tracking.js"),
  await import("./drizzle/migrations/006_drop_screenshot_column.js"),
  await import("./drizzle/migrations/007_rename_updates.js"),
  await import("./drizzle/migrations/008_rename_update_columns.js"),
  await import(
    "./drizzle/migrations/009_add_character_id_to_writer_updates.js"
  ),
  await import("./drizzle/migrations/010_create_checkpoints.js"),
];

const databaseUrl = await join(
  await appLocalDataDir(),
  import.meta.env.VITE_DATABASE_PATH,
);

/**
 * A raw SQLite database client.
 */
export const sqlite = await Sqlite.open(databaseUrl);

/**
 * The drizzle database instance.
 * @see https://github.com/tdwesten/tauri-drizzle-sqlite-proxy-demo/issues/1.
 */
const db = drizzle<typeof schema>(
  async (sql, params, method) => {
    // console.debug({ sql, params, method });

    let rows: any = [];

    if (method === "all" || method === "get") {
      const queryResult = await sqlite.query(sql, params);
      // console.debug({ queryResult });

      // ADHOC: Relational columns must be moved to the end of the array.
      let relCols: string[] | undefined;
      const relColsIndex = queryResult.columns.indexOf("_rel");
      if (relColsIndex !== -1) {
        const relColsRaw = queryResult.rows.at(0)?.[relColsIndex];
        if (relColsRaw) relCols = JSON.parse(relColsRaw) as [string];
      }

      // Sort the keys of each row.
      // This is necessary because drizzle-orm/sqlite-proxy
      // parses the columns in the order of definition. 😬
      // Relational columns are expected to be at the end of the array.
      rows = queryResultToObjects(queryResult).map((row: any) => {
        return Object.keys(row)
          .sort(
            (a, b) => (relCols?.indexOf(a) ?? -1) - (relCols?.indexOf(b) ?? -1),
          )
          .map((key) => row[key]);
      });

      // console.debug({ rows });

      // If the method is "all", return all rows,
      // otherwise return the first row.
      rows = method === "all" ? rows : rows[0];
    } else {
      await sqlite.execute(sql, params);
    }

    // Return the results
    return {
      rows,
    };
  },
  // Pass the schema to the drizzle instance
  { schema },
);

const d = {
  db,
  ...pick(schema, [
    "directorUpdates",
    "llamaInferences",
    "simulations",
    "writerUpdates",
    "checkpoints",
  ]),
};

export { d };

/**
 * Parse a raw SQLite query result into an array of objects.
 * Would look up the column names in the table schema.
 */
export function parseSelectResult<
  T extends SQLiteTable<U>,
  U extends TableConfig,
>(
  _table: T,
  result: {
    columns: string[];
    rows: any[][];
  },
): InferSelectModel<T>[] {
  return result.rows.map((row) => {
    const obj: any = {};

    for (const [i, col] of result.columns.entries()) {
      // Map "user_id" to "userId".
      const colName = Object.keys(_table).find((key) =>
        key in _table && "name" in (_table as any)[key]
          ? (_table as any)[key].name === col
          : false,
      );

      if (!colName) {
        console.warn(`Column "${col}" not found in the table schema`);
        continue;
      }

      obj[colName] = row[i];
    }

    return obj;
  });
}

export async function migrate(toIndex = MIGRATIONS.length - 1) {
  return migrate_(MIGRATIONS, MIGRATIONS_TABLE, MIGRATIONS_KEY, toIndex);
}
