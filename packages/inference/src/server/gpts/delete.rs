use crate::server::{AppError, AppState};
use axum::extract::{Path, State};
use std::sync::Arc;

/// Delete (unload) a GPT instance.
/// Path: `DELETE /gpts/:id`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    let mut hash_map_lock = state.gpt.instances.lock().await;
    hash_map_lock.remove(&id);
    Ok(())
}
