import { invoke } from "@tauri-apps/api";

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

export async function sqlite_open(uri: string): Promise<void> {
  return await invoke("sqlite_open", { uri });
}

export async function sqlite_execute(
  uri: string,
  sql: string,
  params: any[] = [],
): Promise<void> {
  return await invoke("sqlite_execute", { uri, sql, params });
}

export async function sqlite_query(
  uri: string,
  sql: string,
  params: any[] = [],
): Promise<QueryResult> {
  return await invoke("sqlite_query", { uri, sql, params });
}

export async function sqlite_close(uri: string): Promise<void> {
  return await invoke("sqlite_close", { uri });
}

export class Sqlite {
  static async open(uri: string): Promise<Sqlite> {
    await sqlite_open(uri);
    return new Sqlite(uri);
  }

  private constructor(readonly uri: string) {}

  async execute(sql: string, params: any[] = []): Promise<void> {
    return await sqlite_execute(this.uri, sql, params);
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    return await sqlite_query(this.uri, sql, params);
  }

  async close(): Promise<void> {
    return await sqlite_close(this.uri);
  }
}
