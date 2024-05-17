#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use simularity_core::{GptBackend, GptContext, GptModel};
use std::{collections::HashMap, sync::Arc};
use tauri::async_runtime::Mutex;

mod commands;
mod sqlite;

struct GptInstance {
    pub model_path: String,
    pub context_size: u32,
    pub batch_size: usize,
    pub context: GptContext<'static>,

    /// A key uniquely mapped to an actual KV cache value.
    pub kv_cache_key: String,
}

struct AppState {
    gpt_backend: GptBackend,

    /// {model_path => model tuple}.
    /// TODO: Hash by actual model hash (e.g. sha256 of the model file).
    pub gpt_models: Mutex<HashMap<String, (Box<GptModel>, &'static GptModel)>>,

    /// {id => GptInstance}.
    pub gpt_instances: Mutex<HashMap<String, Arc<Mutex<GptInstance>>>>,

    /// ADHOC: Limit the number of simultaneous inferences to 1.
    pub inference_mutex: Mutex<()>,

    /// { uri => connection }. A connection will be held until it is closed.
    pub sqlite_connections: Mutex<HashMap<String, Arc<Mutex<rusqlite::Connection>>>>,
}

/// Macro for both the up and down migrations.
/// ```
/// migration!("foo")
/// // is equivalent to
/// M::up(include_str!("../db/migrations/foo/up.sql"))
///    .down(include_str!("../db/migrations/foo/down.sql"))
/// ```
macro_rules! migration {
    ($name:literal) => {
        rusqlite_migration::M::up(include_str!(concat!("../db/migrations/", $name, "/up.sql")))
            .down(include_str!(concat!(
                "../db/migrations/",
                $name,
                "/down.sql"
            )))
    };
}

fn migrate_up(sqlite_uri: &str) {
    println!("Migrating SQLite database up at {}", sqlite_uri);

    let migrations = rusqlite_migration::Migrations::new(vec![
        migration!("001_create_simulations"),
        migration!("002_create_llama_inferences"),
        migration!("003_create_story_updates"),
        migration!("004_create_code_updates"),
        migration!("005_add_created_by_player_to_story_updates"),
        migration!("006_add_simulation_head_tracking"),
        migration!("007_drop_screenshot_column"),
        migration!("008_rename_updates"),
        migration!("009_rename_update_columns"),
    ]);

    assert!(migrations.validate().is_ok());
    let mut conn = rusqlite::Connection::open(sqlite_uri).unwrap();
    migrations.to_latest(&mut conn).unwrap();
}

impl AppState {
    pub fn new() -> Self {
        Self {
            gpt_backend: simularity_core::init_backend()
                .expect("unable to create the llama backend"),
            gpt_models: Mutex::new(HashMap::new()),
            gpt_instances: Mutex::new(HashMap::new()),
            inference_mutex: Mutex::new(()),
            sqlite_connections: Mutex::new(HashMap::new()),
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            let sqlite_uri = app
                .path_resolver()
                .app_local_data_dir()
                .unwrap()
                .join("test.db");
            migrate_up(sqlite_uri.to_str().unwrap());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gpt::gpt_find_or_create,
            commands::gpt::gpt_reset,
            commands::gpt::gpt_decode,
            commands::gpt::gpt_infer,
            commands::gpt::gpt_commit,
            commands::gpt::gpt_token_count,
            commands::sqlite::sqlite_open,
            commands::sqlite::sqlite_execute,
            commands::sqlite::sqlite_query,
            commands::sqlite::sqlite_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
