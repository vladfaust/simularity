use sha2::{Digest, Sha256};
use std::time::Instant;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEventPayload {
    pub progress: f32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// The session ID.
    session_id: String,

    /// Whether was the session loaded, if `initial_prompt` was set.
    /// False means a session file was not found, and decoding was done.
    session_loaded: Option<bool>,

    /// If `dump_session` is set and session was dumped,
    /// the size of the dumped session file in bytes.
    session_dump_size: Option<usize>,

    /// Current context length in tokens (0 when empty).
    context_length: usize,
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
/// Create a new GPT instance.
///
/// # Arguments
///
/// * `model_id` - The model ID, obtained from `gpt_load_model`.
/// * `context_size` - Context size, or `None` for default by model.
/// * `initial_prompt` - If set, would try to load the session
///    from cache, otherwise decode from scratch.
/// * `progress_event_name` - If set, would emit progress events.
/// * `dump_session` - If set, would dump the session to cache.
///
pub async fn gpt_create(
    model_id: &str,
    context_size: usize,
    initial_prompt: Option<&str>,
    progress_event_name: Option<&str>,
    dump_session: Option<bool>,
    app: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Response, tauri::InvokeError> {
    println!(
        "gpt_create(model_id: {}, context_size: {}, initial_prompt: {}, progress_event_name: {}, dump_session: {:?})",
        model_id, context_size,
        if initial_prompt.is_some() {
            "Some"
        } else {
            "None"
        },
        progress_event_name.unwrap_or("None"), dump_session
    );

    let state_file_path = if dump_session.unwrap_or(false)
        && let Some(prompt) = initial_prompt.as_ref()
    {
        let model_hash = simularity_core::model_get_hash_by_id(model_id).unwrap();
        let model_hash = format!("{:x}", model_hash);

        let mut hasher = Sha256::new();
        hasher.update(model_hash.as_bytes());
        hasher.update(prompt.as_bytes());
        let state_hash = format!("{:x}", hasher.finalize());

        let state_file_path = app
            .path_resolver()
            .app_cache_dir()
            .expect("app cache dir is available")
            .join(format!("{}.llama-state", state_hash));

        std::fs::create_dir_all(
            state_file_path
                .parent()
                .expect("state file path has parent directory"),
        )
        .expect("state file path is valid");

        Some(
            state_file_path
                .to_str()
                .expect("state file path is valid utf-8")
                .to_string(),
        )
    } else {
        None
    };

    let progress_callback = if let Some(event_name) = progress_event_name.as_ref() {
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        Some(move |progress: f32| -> bool {
            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let payload = ProgressEventPayload { progress };

            window.emit(event_name, payload).unwrap();
            last_emit = Some(std::time::Instant::now());

            true
        })
    } else {
        None
    };

    let create_result = simularity_core::gpt::create(
        model_id,
        Some(context_size as u32),
        initial_prompt,
        state_file_path.as_deref(),
        progress_callback,
    );

    if let Err(err) = create_result {
        match err {
            simularity_core::gpt::create::Error::ModelNotFound => {
                return Err(tauri::InvokeError::from("Model not found"));
            }
            simularity_core::gpt::create::Error::SessionLimitReached => {
                return Err(tauri::InvokeError::from("Session limit reached"));
            }
            simularity_core::gpt::create::Error::ContextCreationFailed => {
                return Err(tauri::InvokeError::from("Context creation failed"));
            }
            simularity_core::gpt::create::Error::DecodeFailed => {
                return Err(tauri::InvokeError::from("Decode failed"));
            }
            simularity_core::gpt::create::Error::Unknown(code) => {
                return Err(tauri::InvokeError::from(format!(
                    "Unknown error code {}",
                    code
                )));
            }
        }
    }

    // TODO: Return rich information about the session.
    let session_id = create_result.unwrap() as u32;
    let session_loaded: Option<bool> = None;
    let session_dump_size: Option<usize> = None;
    let context_length = 0;

    let mut hash_map_lock = state.gpt_sessions.lock().await;
    hash_map_lock.insert(session_id, model_id.to_string());

    Ok(Response {
        session_id: session_id.to_string(),
        session_loaded,
        context_length,
        session_dump_size,
    })
}
