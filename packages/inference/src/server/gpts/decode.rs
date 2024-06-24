use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use axum_streams::StreamBodyAsOptions;
use std::{sync::Arc, time::Instant};
use tokio::sync::mpsc::channel;

use crate::server::{AppError, AppState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    prompt: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    progress: f32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Epilogue {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New context length in tokens.
    context_length: usize,
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub enum Chunk {
    Progress(Progress),
    Epilogue(Epilogue),
}

/// Decode a prompt using a GPT instance.
/// Path: `POST /gpts/:id/decode` (streaming).
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Json<RequestBody>,
) -> Result<Response, AppError> {
    let hash_map_lock = state.gpt.instances.lock().await;
    let arc = hash_map_lock
        .get(&id)
        .ok_or_else(|| AppError(anyhow::anyhow!("gpt not found")))?
        .clone();

    // Chunks are expected to be yielded rarely.
    let (sender, receiver) = channel::<Chunk>(32);

    tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();

        let start = std::time::Instant::now();
        let tokens = gpt.model.tokenize(&req.prompt);

        let tokens_len = tokens.len();
        let mut cur_node: usize = 0;

        // NOTE: The callback itself is throttled on the llama.cpp side.
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        let sender_clone = sender.clone();
        let callback_fn = move || -> bool {
            cur_node += 1;

            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let progress = cur_node as f32 / (tokens_len as f32 * 2.0);
            let chunk = Chunk::Progress(Progress { progress });
            sender_clone.blocking_send(chunk).unwrap();

            last_emit = Some(std::time::Instant::now());
            true
        };

        let callback_fn = Box::new(callback_fn);
        let _ = gpt.context.decode(req.prompt.clone(), Some(callback_fn));

        let chunk = Chunk::Epilogue(Epilogue {
            duration: start.elapsed().as_millis() as u32,
            context_length: gpt.context.kv_cache_size(),
        });
        sender.blocking_send(chunk).unwrap();
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
    let stream_body = StreamBodyAsOptions::new().json_nl(stream);

    Ok(stream_body.into_response())
}
