### SQLite Migrations Are not Applied

When deleted SQLite tables, the migrations are not applied.
Restarting did not help.

```
Migrating SQLite database up at /Users/vladfaust/Library/Application Support/com.tauri.dev/test.db
```

Only after deleting the DB it worked.
