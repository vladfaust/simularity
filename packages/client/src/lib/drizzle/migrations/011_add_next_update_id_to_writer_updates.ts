import { sqlite } from "@/lib/drizzle";
import { sql } from "@/lib/utils";

export const name = "011_add_next_update_id_to_writer_updates";

export async function upClient(client: typeof sqlite) {
  await client.executeBatch(sql`
    -- Add "next_update_id" to "writer_updates".
    ALTER TABLE writer_updates
    ADD COLUMN next_update_id TEXT;
  `);

  const headWriterUpdateIds = (
    await client.query(sql`
      SELECT
        head_writer_update_id
      FROM
        simulations;
    `)
  ).rows.map((row) => row[0] as string);

  async function setParentNextUpdateId(childUpdateId: string) {
    const rawChild = await client.query(
      sql`
        SELECT
          parent_update_id
        FROM
          writer_updates
        WHERE
          id = ?
      `,
      [childUpdateId],
    );
    const child = rawChild.rows.map((row) => ({
      parentUpdateId: row[0] as string | null,
    }))[0];

    if (child?.parentUpdateId) {
      await client.execute(
        sql`
          UPDATE writer_updates
          SET
            next_update_id = ?
          WHERE
            id = ?
        `,
        [childUpdateId, child.parentUpdateId],
      );

      await setParentNextUpdateId(child.parentUpdateId);
    }
  }

  for (const headWriterUpdateId of headWriterUpdateIds) {
    await setParentNextUpdateId(headWriterUpdateId);
  }
}

export function down() {
  return sql`
    -- Drop "next_update_id" from "writer_updates".
    ALTER TABLE writer_updates
    DROP COLUMN next_update_id;
  `;
}
