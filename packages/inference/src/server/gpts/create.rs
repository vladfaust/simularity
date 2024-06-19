use super::GptInstance;
use crate::server::{AppError, AppState};
use axum::{extract::State, Json};
use log::info;
use sha2::{Digest, Sha256};
use simularity_core::gpt;
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequestBody {
    id: String,

    /// If set, would try loading the GPT session
    /// from prompt's hash, otherwise decode from scratch.
    initial_prompt: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResponseBody {
    /// Whether was the session loaded, if `initial_prompt` is set.
    /// False means a session file was not found.
    session_loaded: Option<bool>,
}

/// Create a new GPT instance.
/// Path: `POST /gpts`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    req: Json<CreateSessionRequestBody>,
) -> Result<Json<CreateResponseBody>, AppError> {
    let mut hash_map_lock = state.gpt.instances.lock().await;

    let context_size =
        std::env::var("GPT_CONTEXT_SIZE").expect("GPT_CONTEXT_SIZE env variable is not set");

    let context_size = context_size
        .parse::<usize>()
        .expect("GPT_CONTEXT_SIZE is not a valid number");

    let batch_size = context_size;

    let instance = GptInstance {
        context: gpt::Context::new(
            &state.gpt.backend,
            state.gpt.model,
            context_size,
            batch_size,
            None,
        )
        .expect("unable to create GPT context"),
        model: state.gpt.model,
    };

    let instance = Arc::new(std::sync::Mutex::new(instance));
    hash_map_lock.insert(req.id.clone(), instance.clone());
    drop(hash_map_lock);

    let mut session_loaded: Option<bool> = None;
    if let Some(initial_prompt) = req.initial_prompt.as_ref() {
        let mut hasher = Sha256::new();
        hasher.update(initial_prompt.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        let session_file_path = std::env::temp_dir().join(format!("{}.llama-session", hash));

        let mut gpt = instance.lock().unwrap();
        let tokens = gpt.model.tokenize(initial_prompt);

        if session_file_path.exists() {
            info!("Will load llama.cpp session from {:?}", session_file_path,);

            let start = std::time::Instant::now();
            gpt.context
                .load_session(&session_file_path, tokens)
                .unwrap();

            info!(
                "Loaded llama.cpp session from {:?} in {}s",
                session_file_path,
                start.elapsed().as_secs()
            );

            session_loaded = Some(true);
        } else {
            info!(
                "Llama.cpp session file does not exist at {:?}, will decode",
                session_file_path
            );

            gpt.context.decode(initial_prompt.clone())?;
            session_loaded = Some(false);
        }
    }

    Ok(Json(CreateResponseBody { session_loaded }))
}
