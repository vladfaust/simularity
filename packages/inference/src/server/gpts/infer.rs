use crate::server::{AppError, AppState};
use axum::{
    extract::{Path, State},
    Json,
};
use simularity_core::InferOptions;
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRequestBody {
    prompt: Option<String>,
    n_eval: usize,
    options: InferOptions,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceResponseBody {
    /// Inference duration in milliseconds.
    duration: u32,

    /// New (potentially committed) KV cache size in tokens.
    kv_cache_size: usize,

    /// Inference result.
    // TODO: Streaming.
    result: String,
}

/// Perform inference using a GPT instance.
/// Path: `POST /gpts/:id/infer`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Json<InferenceRequestBody>,
) -> Result<Json<InferenceResponseBody>, AppError> {
    let hash_map_lock = state.gpt.instances.lock().await;
    let arc = hash_map_lock
        .get(&id)
        .ok_or_else(|| AppError(anyhow::anyhow!("gpt not found")))?
        .clone();

    let start = std::time::Instant::now();
    let result = tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();

        simularity_core::infer(
            &mut gpt.context,
            req.prompt.as_deref(),
            req.n_eval,
            req.options.clone(),
        )
    })
    .await??;

    let body = Json(InferenceResponseBody {
        duration: start.elapsed().as_millis() as u32,
        // TODO: Actually return the potential new KV cache size.
        kv_cache_size: 0,
        result,
    });

    Ok(body)
}
