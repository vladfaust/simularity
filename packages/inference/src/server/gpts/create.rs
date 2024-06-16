use super::GptInstance;
use crate::server::{AppError, AppState};
use axum::{extract::State, Json};
use simularity_core::gpt;
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequestBody {
    id: String,
}

/// Create a new GPT instance.
/// Path: `POST /gpts`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    req: Json<CreateSessionRequestBody>,
) -> Result<(), AppError> {
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
            context_size as u32,
            batch_size,
            None,
        )
        .expect("unable to create GPT context"),
    };

    hash_map_lock.insert(req.id.clone(), Arc::new(std::sync::Mutex::new(instance)));

    Ok(())
}
