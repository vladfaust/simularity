#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use simularity_core::{GptBackend, GptContext, GptModel};
use tauri::async_runtime::Mutex;

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
    tauri::Builder::default()
        .manage(AppState::new())
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
