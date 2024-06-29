use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use axum_streams::StreamBodyAsOptions;
use log::warn;
use simularity_core::gpt::InferOptions;
use std::{
    sync::{atomic::AtomicU16, Arc},
    time::Instant,
};
use tokio::sync::mpsc::channel;

use crate::server::{AppError, AppState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    prompt: Option<String>,
    n_eval: usize,
    options: InferOptions,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DecodeProgress {
    progress: f32,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Inference {
    content: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
/// Returned when `stream` is `false`.
pub struct Epilogue {
    /// Inference duration in milliseconds.
    duration: u32,

    /// Whether the inference was aborted.
    aborted: bool,

    /// Inferenced token length.
    token_length: usize,

    /// New (potentially committed) context length in tokens.
    context_length: usize,
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub enum Chunk {
    Decoding(DecodeProgress),
    Inference(Inference),
    Epilogue(Epilogue),
}

/// Perform inference using a GPT instance.
/// Path: `POST /gpts/:id/infer` (streaming).
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
    drop(hash_map_lock);

    let (sender, receiver) = channel::<Chunk>(req.n_eval);

    tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();
        let token_length = AtomicU16::new(0);

        let inference_callback = Some(|content: &str| -> bool {
            let chunk = Chunk::Inference(Inference {
                content: content.to_string(),
            });

            sender.blocking_send(chunk).unwrap();
            token_length.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

            let hash_map_lock = state.gpt.abortion_flags.blocking_lock();
            let abortion_flag = hash_map_lock.get(&id).unwrap();
            if abortion_flag.load(std::sync::atomic::Ordering::Relaxed) {
                warn!("abortion flag set, aborting inference");
                true
            } else {
                false
            }
        });

        let start = Instant::now();
        if let Some(prompt) = req.prompt.as_ref() {
            let tokens = gpt.model.tokenize(prompt);
            let tokens_len = tokens.len();

            let mut cur_node: usize = 0;

            // NOTE: The callback itself is throttled on the llama.cpp side.
            let throttle = std::time::Duration::from_millis(500);
            let mut last_emit: Option<Instant> = None;

            let sender_clone = sender.clone();
            let decode_callback = move || -> bool {
                cur_node += 1;

                // Throttle the event emission.
                if let Some(last_emit) = last_emit {
                    if last_emit.elapsed() < throttle {
                        return true;
                    }
                }

                let progress = cur_node as f32 / (tokens_len as f32 * 2.0);
                let chunk = Chunk::Decoding(DecodeProgress { progress });
                sender_clone.blocking_send(chunk).unwrap();

                last_emit = Some(std::time::Instant::now());
                true
            };
            let decode_callback = Box::new(decode_callback);

            gpt.context
                .infer(
                    req.prompt.as_deref(),
                    req.n_eval,
                    req.options.clone(),
                    Some(decode_callback),
                    inference_callback,
                )
                .expect("unable to perform inference");
        } else {
            gpt.context
                .infer(
                    req.prompt.as_deref(),
                    req.n_eval,
                    req.options.clone(),
                    None,
                    inference_callback,
                )
                .expect("unable to perform inference");
        }

        let hash_map_lock = state.gpt.abortion_flags.blocking_lock();
        let abortion_flag = hash_map_lock.get(&id).unwrap();

        // Send the epilogue.
        sender
            .blocking_send(Chunk::Epilogue(Epilogue {
                duration: start.elapsed().as_millis() as u32,
                aborted: abortion_flag.load(std::sync::atomic::Ordering::Relaxed),
                token_length: token_length.load(std::sync::atomic::Ordering::Relaxed) as usize,
                context_length: gpt.context.kv_cache_size(),
            }))
            .unwrap();

        // Unset the abortion flag.
        abortion_flag.store(false, std::sync::atomic::Ordering::Relaxed);
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
    let stream_body = StreamBodyAsOptions::new().json_nl(stream);

    Ok(stream_body.into_response())
}
