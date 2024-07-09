use axum::{
    extract::Path,
    response::{IntoResponse, Response},
    Json,
};
use axum_streams::StreamBodyAsOptions;
use simularity_core::gpt::DecodeError;
use tokio::sync::mpsc::channel;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    prompt: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorChunk {
    error: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressChunk {
    progress: f32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpilogueChunk {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New context length in tokens.
    context_length: u32,
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub enum Chunk {
    Error(ErrorChunk),
    Progress(ProgressChunk),
    Epilogue(EpilogueChunk),
}

/// Decode a prompt with a GPT instance.
/// Path: `POST /gpts/:id/decode` (streaming).
#[axum::debug_handler]
pub async fn handler(Path(id): Path<u32>, req: Json<RequestBody>) -> Response {
    // Chunks are expected to be yielded rarely.
    let (sender, receiver) = channel::<Chunk>(32);

    tokio::task::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let sender_clone = sender.clone();

        // NOTE: The callback itself is throttled on the llama.cpp side.
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<std::time::Instant> = None;

        let progress_callback = move |progress: f32| -> bool {
            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let chunk = Chunk::Progress(ProgressChunk { progress });
            sender_clone.blocking_send(chunk).unwrap();
            last_emit = Some(std::time::Instant::now());

            true
        };

        let context_length = simularity_core::gpt::decode(id, &req.prompt, Some(progress_callback));

        let chunk = if let Ok(context_length) = context_length {
            Chunk::Epilogue(EpilogueChunk {
                duration: start.elapsed().as_millis() as u32,
                context_length,
            })
        } else {
            Chunk::Error(ErrorChunk {
                error: match context_length.unwrap_err() {
                    DecodeError::SessionNotFound => "Session not found".to_string(),
                    DecodeError::ContextOverflow => "Context overflow".to_string(),
                    DecodeError::Unknown(code) => {
                        panic!("Unknown error code: {}", code)
                    }
                },
            })
        };

        sender.blocking_send(chunk).unwrap();
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
    let stream_body = StreamBodyAsOptions::new().json_nl(stream);

    stream_body.into_response()
}
