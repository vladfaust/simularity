use crate::server::{AppError, AppState};
use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeRequestBody {
    prompt: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeResponseBody {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New KV cache size in tokens.
    kv_cache_size: usize,
}

/// Decode a prompt using a GPT instance.
/// Path: `POST /gpts/:id/decode`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Json<DecodeRequestBody>,
) -> Result<Json<DecodeResponseBody>, AppError> {
    let hash_map_lock = state.gpt.instances.lock().await;
    let arc = hash_map_lock
        .get(&id)
        .ok_or_else(|| AppError(anyhow::anyhow!("gpt not found")))?
        .clone();

    let start = std::time::Instant::now();
    let kv_cache_size = tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();
        let _ = gpt.context.decode(req.prompt.clone());
        gpt.context.kv_cache_size()
    })
    .await?;

    let body = Json(DecodeResponseBody {
        duration: start.elapsed().as_millis() as u32,
        kv_cache_size,
    });

    Ok(body)
}
