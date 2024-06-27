use crate::server::{AppError, AppState};
use axum::extract::{Path, State};
use std::sync::Arc;

/// Reset a GPT to its initial prompt.
/// If no initial prompt was set, the context will be cleared entirely.
/// Path: `POST /gpts/:id/reset`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    let hash_map_lock = state.gpt.instances.lock().await;
    let arc = hash_map_lock
        .get(&id)
        .ok_or_else(|| AppError(anyhow::anyhow!("gpt not found")))?
        .clone();

    tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();
        let from = gpt.initial_prompt_len;
        gpt.context.reset(from)
    })
    .await??;

    Ok(())
}
