use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use axum_streams::StreamBodyAsOptions;
use simularity_core::gpt::InferOptions;
use std::sync::Arc;
use tokio::sync::mpsc::channel;

use crate::server::{AppError, AppState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRequestBody {
    prompt: Option<String>,
    n_eval: usize,
    options: InferOptions,
    stream: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
/// Returned when `stream` is `false`.
pub struct InferenceResponseBody {
    /// Inference duration in milliseconds.
    duration: u32,

    /// New (potentially committed) KV cache size in tokens.
    kv_cache_size: usize,

    /// Inference result.
    result: String,
}

/// Yielded when `stream` is `true`.
#[derive(serde::Serialize, Clone)]
pub struct InferenceResultChunk {
    content: String,
}

/// Perform inference using a GPT instance.
/// Path: `POST /gpts/:id/infer`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Json<InferenceRequestBody>,
) -> Result<Response, AppError> {
    let hash_map_lock = state.gpt.instances.lock().await;
    let arc = hash_map_lock
        .get(&id)
        .ok_or_else(|| AppError(anyhow::anyhow!("gpt not found")))?
        .clone();

    if req.stream {
        let (sender, receiver) = channel::<InferenceResultChunk>(req.n_eval);

        tokio::task::spawn_blocking(move || {
            let mut gpt = arc.lock().unwrap();

            gpt.context.infer(
                req.prompt.as_deref(),
                req.n_eval,
                req.options.clone(),
                Some(|content: &str| {
                    sender
                        .blocking_send(InferenceResultChunk {
                            content: content.to_string(),
                        })
                        .unwrap();
                }),
            )
        });

        let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
        let stream_body = StreamBodyAsOptions::new().json_nl(stream);

        Ok(stream_body.into_response())
    } else {
        let start = std::time::Instant::now();
        let result = tokio::task::spawn_blocking(move || {
            let mut gpt = arc.lock().unwrap();

            gpt.context.infer(
                req.prompt.as_deref(),
                req.n_eval,
                req.options.clone(),
                None::<fn(&str)>,
            )
        })
        .await??;

        let body = Json(InferenceResponseBody {
            duration: start.elapsed().as_millis() as u32,
            // TODO: Actually return the potential new KV cache size.
            kv_cache_size: 0,
            result,
        });

        Ok(body.into_response())
    }
}
