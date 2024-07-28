import { sqlite } from "@/lib/drizzle";
import { sql } from "@/lib/utils";

export const name = "013_add_simulation_id_to_checkpoints";

export async function upClient(client: typeof sqlite) {
  await client.executeBatch(sql`
    -- Add "simulation_id" to "checkpoints".
    ALTER TABLE checkpoints
    ADD COLUMN simulation_id TEXT;
    -- Make "writer_update_id" nullable.
    -- Sqlite does not support ALTER COLUMN, so we have to:
    -- 1. Create a new column.
    ALTER TABLE checkpoints
    ADD COLUMN writer_update_id_new TEXT;
    -- 2. Copy the data.
    UPDATE checkpoints
    SET
      writer_update_id_new = writer_update_id;
    -- 3. Drop the old column.
    ALTER TABLE checkpoints
    DROP COLUMN writer_update_id;
    -- 4. Rename the new column.
    ALTER TABLE checkpoints
    RENAME COLUMN writer_update_id_new TO writer_update_id;
  `);

  // Run the migration code.
  const checkpoints = (
    await client.query(sql`
      SELECT
        id,
        writer_update_id
      FROM
        checkpoints
    `)
  ).rows.map((row) => ({
    id: row[0] as string,
    writerUpdateId: row[1] as string,
  }));

  for (const checkpoint of checkpoints) {
    console.log(
      `Migrating checkpoint ${checkpoint.id} (${checkpoint.writerUpdateId})...`,
    );

    const writerUpdate = (
      await client.query(
        sql`
          SELECT
            simulation_id
          FROM
            writer_updates
          WHERE
            id = ?
        `,
        [checkpoint.writerUpdateId],
      )
    ).rows.map((row) => ({
      simulationId: row[0] as string,
    }))[0];

    await client.execute(
      sql`
        UPDATE checkpoints
        SET
          simulation_id = ?
        WHERE
          id = ?
      `,
      [writerUpdate.simulationId, checkpoint.id],
    );
  }

  await client.executeBatch(sql`
    -- Make "simulation_id" non-nullable.
    -- Sqlite does not support ALTER COLUMN, so we have to:
    -- 1. ADHOC: Create a new column with a default value.
    ALTER TABLE checkpoints
    ADD COLUMN simulation_id_new TEXT NOT NULL DEFAULT '';
    -- 2. Copy the data.
    UPDATE checkpoints
    SET
      simulation_id_new = simulation_id;
    -- 3. Drop the old column.
    ALTER TABLE checkpoints
    DROP COLUMN simulation_id;
    -- 4. Rename the new column.
    ALTER TABLE checkpoints
    RENAME COLUMN simulation_id_new TO simulation_id;
    -- Add unique constraint on "simulation_id" and "writer_update_id".
    CREATE UNIQUE INDEX checkpoints_unique_idx ON checkpoints (simulation_id, writer_update_id);
  `);
}

export function down() {
  return sql`
    -- Drop "simulation_id" from "checkpoints".
    ALTER TABLE checkpoints
    DROP COLUMN simulation_id;
    -- BREAKING: Make "writer_update_id" non-nullable.
    ALTER TABLE checkpoints ALTER COLUMN writer_update_id
    SET
      NOT NULL;
  `;
}
