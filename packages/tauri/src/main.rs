#![feature(let_chains)]
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::{collections::HashMap, sync::Arc};
use tauri::async_runtime::Mutex;

mod commands;
mod sqlite;

struct AppState {
    /// { id => created }.
    pub gpt_sessions: Mutex<HashMap<u32, ()>>,

    /// { uri => connection }. A connection will be held until it is closed.
    pub sqlite_connections: Mutex<HashMap<String, Arc<Mutex<rusqlite::Connection>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            gpt_sessions: Mutex::new(HashMap::new()),
            sqlite_connections: Mutex::new(HashMap::new()),
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .setup(|_| {
            simularity_core::init(None, None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gpt::load_model::gpt_load_model,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
