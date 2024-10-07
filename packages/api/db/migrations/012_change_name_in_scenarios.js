export function up(sql) {
  return sql`
    -- Drop existing index on "name" column.
    DROP INDEX if EXISTS scenarios_name_idx;
    -- Change "name" column type to JSONB in "scenarios" table.
    -- Need to transfer data; old: "Picnic", new: {"en-US": "Picnic"}.
    ALTER TABLE scenarios
    ALTER COLUMN name
    SET DATA TYPE jsonb USING jsonb_build_object('en-US', name);
    -- Add index to "name" column.
    -- A column value example is {"en-US": "Picnic", "fr-FR": "Pique-nique"}
    -- so we need to use jsonb_path_ops to index it.
    CREATE INDEX scenarios_name_idx ON scenarios USING gin (name jsonb_path_ops);
  `;
}

export function down(sql) {
  return sql`
    -- Drop existing index on "name" column.
    DROP INDEX if EXISTS scenarios_name_idx;
    -- Change "name" column type to TEXT in "scenarios" table.
    -- Need to transfer data; old: {"en-US": "Picnic"}, new: "Picnic".
    ALTER TABLE scenarios
    ALTER COLUMN name
    SET DATA TYPE TEXT USING name ->> 'en-US';
    -- Add index to "name" column.
    CREATE INDEX scenarios_name_idx ON scenarios (name);
  `;
}
