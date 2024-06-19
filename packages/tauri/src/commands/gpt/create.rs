use sha2::{Digest, Sha256};
use std::sync::Arc;

use simularity_core::gpt;
use tauri::async_runtime::Mutex;

use super::get_or_create_model_ref;
use crate::{AppState, GptInstance};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// Whether was the session loaded, if `initial_prompt` is set.
    /// False means a session file was not found.
    session_loaded: Option<bool>,
}

#[tauri::command]
/// Create a new GPT instance.
/// Errors if an instance with the same ID already exists.
/// If `initial_prompt` is set would try to load
/// the session from cache, otherwise decode from scratch.
pub async fn gpt_create(
    gpt_id: String,
    model_path: String,
    context_size: usize,
    batch_size: usize,
    initial_prompt: Option<String>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Response, tauri::InvokeError> {
    println!(
        "gpt_create(gpt_id: {:?}, model_path: {}, context_size: {}, batch_size: {}, initial_prompt: {:?})",
        gpt_id, model_path, context_size, batch_size, if initial_prompt.is_some() { "Some(_)" } else { "None" },
    );

    let mut hash_map_lock = state.gpt_instances.lock().await;

    if hash_map_lock.contains_key(&gpt_id) {
        return Err(tauri::InvokeError::from("gpt already exists"));
    }

    let model_ref = get_or_create_model_ref(model_path.clone(), &state).await?;

    let mut instance = GptInstance {
        model: model_ref,
        context: gpt::Context::new(
            &state.gpt_backend,
            model_ref,
            context_size,
            batch_size,
            None,
        )
        .map_err(tauri::InvokeError::from_anyhow)?,
    };

    let mut session_loaded: Option<bool> = None;

    if let Some(prompt) = initial_prompt.as_ref() {
        let mut hasher = Sha256::new();
        hasher.update(prompt.as_bytes());
        let session_hash = format!("{:x}", hasher.finalize());

        // TODO: Extract to a function, use `gpt` subdir.
        let session_file_path = app
            .path_resolver()
            .app_cache_dir()
            .expect("failed to get app cache dir")
            .join(format!("{}.llama-session", session_hash));

        std::fs::create_dir_all(session_file_path.parent().unwrap()).unwrap();
        let tokens = instance.model.tokenize(prompt);

        // Check that the file exists before trying to load it.
        if session_file_path.exists() {
            println!("Will load llama.cpp session from {:?}", session_file_path);
            let start = std::time::Instant::now();

            instance
                .context
                .load_session(&session_file_path, tokens)
                .map_err(tauri::InvokeError::from_anyhow)?;

            println!(
                "loaded llama.cpp session from {:?} in {}s",
                session_file_path,
                start.elapsed().as_secs()
            );

            session_loaded = Some(true);
        } else {
            println!(
                "llama.cpp session file does not exist at {:?}",
                session_file_path
            );

            instance
                .context
                .decode(prompt.clone())
                .map_err(tauri::InvokeError::from_anyhow)?;

            session_loaded = Some(true);
        }
    }

    hash_map_lock.insert(gpt_id, Arc::new(Mutex::new(instance)));

    Ok(Response { session_loaded })
}
