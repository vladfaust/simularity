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
    n_eval: u32,
    options: Option<InferOptions>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorChunk {
    error: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DecodeProgressChunk {
    progress: f32,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InferenceChunk {
    content: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
/// Returned when `stream` is `false`.
pub struct EpilogueChunk {
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
    Error(ErrorChunk),
    Decoding(DecodeProgressChunk),
    Inference(InferenceChunk),
    Epilogue(EpilogueChunk),
}

/// Perform inference using a GPT instance.
/// Path: `POST /gpts/:id/infer` (streaming).
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
    req: Json<RequestBody>,
) -> Result<Response, AppError> {
    let (sender, receiver) = channel::<Chunk>(req.n_eval as usize);

    tokio::task::spawn_blocking(move || {
        let token_length = AtomicU16::new(0);

        let inference_callback = |content: &str| -> bool {
            let chunk = Chunk::Inference(InferenceChunk {
                content: content.to_string(),
            });

            sender.blocking_send(chunk).unwrap();
            token_length.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

            let hash_map_lock = state.gpt.abort_flags.blocking_lock();
            let abortion_flag = hash_map_lock.get(&id).unwrap();
            if abortion_flag.load(std::sync::atomic::Ordering::Relaxed) {
                warn!("abortion flag set, aborting inference");
                false
            } else {
                true
            }
        };

        // NOTE: The callback itself is throttled on the llama.cpp side.
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        let sender_clone = sender.clone();
        let decode_progress_callback = move |progress| -> bool {
            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let chunk = Chunk::Decoding(DecodeProgressChunk { progress });
            sender_clone.blocking_send(chunk).unwrap();

            last_emit = Some(std::time::Instant::now());
            true
        };

        let start = Instant::now();
        let num_decoded = simularity_core::gpt::infer(
            id,
            req.prompt.as_deref(),
            req.n_eval,
            req.options.clone(),
            Some(decode_progress_callback),
            Some(inference_callback),
        );

        if let Err(err) = num_decoded {
            let chunk = Chunk::Error(ErrorChunk {
                error: match err {
                    simularity_core::gpt::InferError::SessionNotFound => {
                        "Session not found".to_string()
                    }
                    simularity_core::gpt::InferError::ContextOverflow => {
                        "Context overflow".to_string()
                    }
                    simularity_core::gpt::InferError::Unknown(code) => {
                        panic!("Unknown error code: {}", code)
                    }
                },
            });

            sender.blocking_send(chunk).unwrap();
            return;
        }

        let hash_map_lock = state.gpt.abort_flags.blocking_lock();
        let abortion_flag = hash_map_lock.get(&id).unwrap();

        // Send the epilogue.
        sender
            .blocking_send(Chunk::Epilogue(EpilogueChunk {
                duration: start.elapsed().as_millis() as u32,
                aborted: abortion_flag.load(std::sync::atomic::Ordering::Relaxed),
                token_length: token_length.load(std::sync::atomic::Ordering::Relaxed) as usize,
                context_length: 0, // TODO: Get the context length.
            }))
            .unwrap();

        // Unset the abortion flag.
        abortion_flag.store(false, std::sync::atomic::Ordering::Relaxed);
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
    let stream_body = StreamBodyAsOptions::new().json_nl(stream);

    Ok(stream_body.into_response())
}
