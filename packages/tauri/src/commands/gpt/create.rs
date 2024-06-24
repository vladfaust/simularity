use sha2::{Digest, Sha256};
use simularity_core::gpt;
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Instant,
};
use tauri::async_runtime::Mutex;

use super::common::DecodeProgress;
use super::get_or_create_model_ref;
use crate::{AppState, GptInstance};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// Whether was the session loaded, if `initial_prompt` was set.
    /// False means a session file was not found, and decoding was done.
    session_loaded: Option<bool>,

    /// If `dump_session` is set and session was dumped,
    /// the size of the dumped session file in bytes.
    session_dump_size: Option<usize>,

    /// Current context length in tokens (0 when empty).
    context_length: usize,
}

static GPT_COUNTER: AtomicUsize = AtomicUsize::new(0);

#[tauri::command]
/// Create a new GPT instance.
/// Errors if an instance with the same ID already exists.
///
/// # Arguments
///
/// * `initial_prompt` if set, would try to load the session
///    from cache, otherwise decode from scratch.
///
pub async fn gpt_create(
    gpt_id: String,
    model_path: String,
    context_size: usize,
    batch_size: usize,
    initial_prompt: Option<String>,
    progress_event_name: Option<String>,
    dump_session: Option<bool>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<Response, tauri::InvokeError> {
    println!(
        "gpt_create(gpt_id: {:?}, model_path: {}, context_size: {}, batch_size: {}, initial_prompt: {:?}, progress_event_name: {}, dump_session: {})",
        gpt_id, model_path, context_size, batch_size, if initial_prompt.is_some() { "Some(_)" } else { "None" }, progress_event_name.as_deref().unwrap_or("None"), dump_session.unwrap_or(false),
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
            Some(GPT_COUNTER.fetch_add(1, Ordering::Relaxed)),
        )
        .map_err(tauri::InvokeError::from_anyhow)?,
    };

    let mut session_loaded: Option<bool> = None;
    let mut session_dump_size: Option<usize> = None;

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

            if let Some(event_name) = progress_event_name.as_ref() {
                let event_name = event_name.clone();
                let mut cur_node: usize = 0;
                let total_tokens = tokens.len();

                // NOTE: The callback itself is throttled on the llama.cpp side.
                let throttle = std::time::Duration::from_millis(500);
                let mut last_emit: Option<Instant> = None;

                let callback_fn = move || -> bool {
                    cur_node += 1;

                    // Throttle the event emission.
                    if let Some(last_emit) = last_emit {
                        if last_emit.elapsed() < throttle {
                            return true;
                        }
                    }

                    let payload = DecodeProgress {
                        progress: cur_node as f32 / (total_tokens as f32 * 2.0),
                    };

                    window.emit(&event_name, payload).unwrap();
                    last_emit = Some(std::time::Instant::now());

                    true
                };
                let callback_fn = Box::new(callback_fn);

                instance
                    .context
                    .decode(prompt.clone(), Some(callback_fn))
                    .map_err(tauri::InvokeError::from_anyhow)?;
            } else {
                instance
                    .context
                    .decode(prompt.clone(), None)
                    .map_err(tauri::InvokeError::from_anyhow)?;
            }

            session_loaded = Some(true);

            if let Some(dump) = dump_session {
                if dump {
                    let start = std::time::Instant::now();

                    instance
                        .context
                        .save_session_file(&session_file_path, &tokens)
                        .map_err(tauri::InvokeError::from_anyhow)?;

                    session_dump_size = Some(
                        std::fs::metadata(&session_file_path)
                            .expect("failed to get metadata for session file")
                            .len() as usize,
                    );

                    println!(
                        "dumped llama.cpp session to {:?} in {}s ({})",
                        session_file_path,
                        start.elapsed().as_secs(),
                        bytesize::ByteSize(session_dump_size.unwrap() as u64)
                    );
                }
            }
        }
    }

    let context_length = instance.context.kv_cache_size();
    hash_map_lock.insert(gpt_id, Arc::new(Mutex::new(instance)));

    Ok(Response {
        session_loaded,
        context_length,
        session_dump_size,
    })
}
