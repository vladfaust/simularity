use std::{
    collections::HashMap,
    fs::create_dir_all,
    sync::{atomic::AtomicBool, Arc},
};
use tauri::{async_runtime::Mutex, Manager};

mod commands;
mod sqlite;

struct AppState {
    /// { id => model_id }.
    pub gpt_sessions: Mutex<HashMap<u32, String>>,

    /// { uri => connection }. A connection will be held until it is closed.
    pub sqlite_connections: Mutex<HashMap<String, Arc<Mutex<rusqlite::Connection>>>>,

    /// { file_path => abort_flag }. A download will be held until it is complete.
    pub file_downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            gpt_sessions: Mutex::new(HashMap::new()),
            sqlite_connections: Mutex::new(HashMap::new()),
            file_downloads: Mutex::new(HashMap::new()),
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .setup(move |app| {
            app.manage(AppState::new());

            // Create the application data directory if it does not exist.
            let path = app
                .path()
                .app_data_dir()
                .expect("This should never be None");
            create_dir_all(&path)?;

            simularity_core::init(None, None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gpt::load_model::gpt_load_model,
            commands::gpt::model_hash::gpt_model_hash_by_id,
            commands::gpt::model_hash::gpt_model_hash_by_path,
            commands::gpt::find::gpt_find,
            commands::gpt::create::gpt_create,
            commands::gpt::decode::gpt_decode,
            commands::gpt::infer::gpt_infer,
            commands::gpt::destroy::gpt_destroy,
            commands::sqlite::sqlite_open,
            commands::sqlite::sqlite_execute,
            commands::sqlite::sqlite_execute_batch,
            commands::sqlite::sqlite_query,
            commands::sqlite::sqlite_close,
            commands::utils::file_manager_open,
            commands::utils::file_sha256,
            commands::utils::file_download::file_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
