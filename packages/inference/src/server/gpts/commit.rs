use crate::server::{AppError, AppState};
use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResponseBody {
    /// New KV cache size in tokens.
    kv_cache_size: usize,
}

/// Commit a recently inferred prompt.
/// Path: `POST /gpts/:id/commit`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<CommitResponseBody>, AppError> {
    let hash_map_lock = state.gpt.instances.lock().await;
    let arc = hash_map_lock
        .get(&id)
        .ok_or_else(|| AppError(anyhow::anyhow!("gpt not found")))?
        .clone();

    let kv_cache_size = tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();
        let _ = simularity_core::commit(&mut gpt.context);
        simularity_core::kv_cache_size(&gpt.context)
    })
    .await?;

    let body = Json(CommitResponseBody { kv_cache_size });

    Ok(body)
}
