#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use simularity_core::{GptBackend, GptContext, GptModel};
use tauri::async_runtime::Mutex;
use tauri_plugin_sql::{Migration, MigrationKind};

mod commands;

struct GptInstance {
    model: Box<GptModel>,
    pub context: GptContext<'static>,
}

struct AppState {
    gpt_backend: GptBackend,
    pub gpt_instance: Mutex<Option<GptInstance>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            gpt_backend: simularity_core::init_backend()
                .expect("unable to create the llama backend"),
            gpt_instance: Mutex::new(None),
        }
    }
}

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "create games table",
        sql: r#"
                CREATE TABLE games (
                    id TEXT PRIMARY KEY NOT NULL,
                    head TEXT NOT NULL,
                    screenshot TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            "#,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:test.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::git::git_init,
            commands::git::git_head,
            commands::git::git_add,
            commands::git::git_commit,
            commands::gpt::gpt_init,
            commands::gpt::gpt_predict
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
