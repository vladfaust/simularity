import { invoke } from "@tauri-apps/api/core";

export type QueryResult = {
  columns: string[];
  rows: any[][];
};

/**
 * Converts a query result to an array of objects.
 *
 * @example
 * const queryResult = { columns: ["foo", "bar"], rows: [[1, 2], [3, 4]] }
 * queryResultToObjects(queryResult) // => [{foo: 1, bar: 2}, {foo: 3, bar: 4}]
 */
export function queryResultToObjects(result: QueryResult): any[] {
  return result.rows.map((row) =>
    row.reduce(
      (acc, value, index) => ({
        ...acc,
        [result.columns[index]]: value,
      }),
      {},
    ),
  );
}

export async function sqliteOpen(uri: string): Promise<void> {
  return await invoke("sqlite_open", { uri });
}

export async function sqliteExecute(
  uri: string,
  sql: string,
  params: any[] = [],
): Promise<void> {
  return await invoke("sqlite_execute", { uri, sql, params });
}

export async function sqliteExecuteBatch(
  uri: string,
  sql: string,
): Promise<void> {
  return await invoke("sqlite_execute_batch", { uri, sql });
}

export async function sqliteQuery(
  uri: string,
  sql: string,
  params: any[] = [],
): Promise<QueryResult> {
  return await invoke("sqlite_query", { uri, sql, params });
}

export async function sqliteClose(uri: string): Promise<void> {
  return await invoke("sqlite_close", { uri });
}

export class Sqlite {
  static async open(uri: string): Promise<Sqlite> {
    await sqliteOpen(uri);
    return new Sqlite(uri);
  }

  private constructor(readonly uri: string) {}

  async execute(sql: string, params: any[] = []): Promise<void> {
    return await sqliteExecute(this.uri, sql, params);
  }

  async executeBatch(sql: string): Promise<void> {
    return await sqliteExecuteBatch(this.uri, sql);
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    return await sqliteQuery(this.uri, sql, params);
  }

  async close(): Promise<void> {
    return await sqliteClose(this.uri);
  }
}
