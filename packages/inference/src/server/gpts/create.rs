use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use axum_streams::StreamBodyAsOptions;
use sha2::{Digest, Sha256};
use simularity_core::gpt::CreateError;
use std::sync::{atomic::AtomicBool, Arc};
use tokio::sync::mpsc::channel;

use crate::{env::ENV, server::AppState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    /// Model ID to use.
    model_id: String,

    /// If set, would load the GPT session by hash or decode from scratch.
    /// Otherwise, the instance will be empty.
    initial_prompt: Option<String>,

    /// If set, would dump the session to a file.
    // FIXME: Dumping session may take some time,
    // which is not currently accounted for.
    dump_session: Option<bool>,
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
    /// GPT session ID.
    session_id: u32,

    /// Whether was the session loaded, if `initial_prompt` was set.
    /// False means a session file was not found, and decoding was done.
    session_loaded: Option<bool>,

    /// If dumped, the size of the dumped session file in bytes.
    session_dump_size: Option<usize>,

    /// Current context length in tokens.
    context_length: usize,
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub enum Chunk {
    Error(ErrorChunk),
    Progress(ProgressChunk),
    Epilogue(EpilogueChunk),
}

/// Create a new GPT instance.
/// Path: `POST /gpts` (streaming).
#[axum::debug_handler]
pub async fn handler(State(state): State<Arc<AppState>>, req: Json<RequestBody>) -> Response {
    let state_file_path = if let Some(initial_prompt) = req.initial_prompt.as_ref()
        && req.dump_session.unwrap_or(false)
    {
        let mut hasher = Sha256::new();
        hasher.update(initial_prompt.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        Some(
            std::env::temp_dir()
                .join(format!("{}.llama-session", hash))
                .to_str()
                .expect("Failed to convert path to string")
                .to_string(),
        )
    } else {
        None
    };

    let (sender, receiver) = channel::<Chunk>(32);

    tokio::task::spawn_blocking(move || {
        let sender_clone = sender.clone();

        // NOTE: The callback itself is throttled on the llama.cpp side.
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<std::time::Instant> = None;

        let session_id = simularity_core::gpt::create(
            req.model_id.as_str(),
            Some(ENV.simularity_model_context_size as u32),
            req.initial_prompt.as_deref(),
            state_file_path.as_deref(),
            Some(|progress| {
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
            }),
        );

        if let Ok(session_id) = session_id {
            // Insert the abortion flag into the hashmap.
            let mut hash_map_lock = state.gpt.abort_flags.blocking_lock();
            hash_map_lock.insert(session_id, AtomicBool::new(false));
            drop(hash_map_lock);

            // Send the epilogue chunk.
            sender_clone
                .blocking_send(Chunk::Epilogue(EpilogueChunk {
                    session_id,
                    session_loaded: None,    // TODO:
                    session_dump_size: None, // TODO:
                    context_length: 0,       // TODO:
                }))
                .unwrap();
        } else {
            // Send the error chunk.
            sender_clone
                .blocking_send(Chunk::Error(ErrorChunk {
                    error: match session_id.unwrap_err() {
                        CreateError::ModelNotFound => "Model not found".to_string(),
                        CreateError::SessionLimitReached => "Session limit reached".to_string(),
                        CreateError::ContextCreationFailed => "Context creation failed".to_string(),
                        CreateError::DecodeFailed => "Decode failed".to_string(),
                        CreateError::Unknown(code) => panic!("Unknown error code: {}", code),
                    },
                }))
                .unwrap();
        }
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
    let stream_body = StreamBodyAsOptions::new().json_nl(stream);

    stream_body.into_response()
}
