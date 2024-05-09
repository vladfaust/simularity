import TauriDatabase from "tauri-plugin-sql-api";
export const tauriDb = await TauriDatabase.load("sqlite:test.db");

export async function createGame(id: string, head: string) {
  tauriDb.execute(
    `
INSERT INTO games (id, head)
VALUES (?, ?)
  `,
    [id, head],
  );
}

export async function updateGame(id: string, head: string, screenshot: string) {
  tauriDb.execute(
    `
UPDATE games
SET head = ?, screenshot = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?
  `,
    [head, screenshot, id],
  );
}

export async function getGames(limit: number, offset?: number) {
  return tauriDb.select<
    {
      id: string;
      head: string;
      screenshot: string | null;
      createdAt: number;
      updatedAt: number;
    }[]
  >(
    `
SELECT id, head, screenshot, created_at, updated_at
FROM games
ORDER BY updated_at DESC
LIMIT ?
OFFSET ?
  `,
    [limit, offset ?? 0],
  );
}
