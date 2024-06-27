use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use axum_streams::StreamBodyAsOptions;
use log::info;
use sha2::{Digest, Sha256};
use simularity_core::gpt;
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Instant,
};
use tokio::sync::mpsc::channel;

use super::GptInstance;
use crate::server::{AppError, AppState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    /// Unique identifier for the GPT instance.
    id: String,

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
pub struct DecodeProgress {
    progress: f32,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionLoadProgress {
    progress: f32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Epilogue {
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
    Decode(DecodeProgress),
    SessionLoad(SessionLoadProgress),
    Epilogue(Epilogue),
}

static GPT_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Create a new GPT instance.
/// Path: `POST /gpts` (streaming).
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    req: Json<RequestBody>,
) -> Result<Response, AppError> {
    let mut hash_map_lock = state.gpt.instances.lock().await;

    let context_size =
        std::env::var("GPT_CONTEXT_SIZE").expect("GPT_CONTEXT_SIZE env variable is not set");

    let context_size = context_size
        .parse::<usize>()
        .expect("GPT_CONTEXT_SIZE is not a valid number");

    let batch_size = context_size;

    let tokens = if let Some(initial_prompt) = req.initial_prompt.as_ref() {
        state.gpt.model.tokenize(initial_prompt)
    } else {
        vec![]
    };

    let instance = GptInstance {
        context: gpt::Context::new(
            &state.gpt.backend,
            state.gpt.model,
            context_size,
            batch_size,
            None,
            Some(GPT_COUNTER.fetch_add(1, Ordering::Relaxed)),
        )
        .expect("unable to create GPT context"),
        model: state.gpt.model,
        initial_prompt_len: tokens.len(),
    };

    let instance = Arc::new(std::sync::Mutex::new(instance));
    hash_map_lock.insert(req.id.clone(), instance.clone());
    drop(hash_map_lock);

    // Chunks are expected to be yielded rarely.
    let (sender, receiver) = channel::<Chunk>(32);

    if let Some(initial_prompt) = req.initial_prompt.as_ref() {
        let initial_prompt = initial_prompt.clone();

        tokio::task::spawn_blocking(move || {
            let mut hasher = Sha256::new();
            hasher.update(initial_prompt.as_bytes());
            let hash = format!("{:x}", hasher.finalize());
            let session_file_path = std::env::temp_dir().join(format!("{}.llama-session", hash));

            let mut gpt = instance.lock().unwrap();
            let context_length = tokens.len();

            if session_file_path.exists() {
                info!("Will load GPT session from {:?}", session_file_path);

                let chunk = Chunk::SessionLoad(SessionLoadProgress { progress: 0.0 });
                sender.blocking_send(chunk).unwrap();

                let start = std::time::Instant::now();

                // TODO: Intermediary session loading progress.
                gpt.context
                    .load_session(&session_file_path, tokens)
                    .unwrap();

                info!(
                    "Loaded GPT session from {:?} in {}s",
                    session_file_path,
                    start.elapsed().as_secs()
                );

                let chunk = Chunk::SessionLoad(SessionLoadProgress { progress: 1.0 });
                sender.blocking_send(chunk).unwrap();

                let chunk = Chunk::Epilogue(Epilogue {
                    session_loaded: Some(true),
                    session_dump_size: None,
                    context_length,
                });
                sender.blocking_send(chunk).unwrap();
            } else {
                info!(
                    "GPT session file does not exist at {:?}, will decode",
                    session_file_path
                );

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

                    let progress = cur_node as f32 / (context_length as f32 * 2.0);
                    let chunk = Chunk::Decode(DecodeProgress { progress });
                    sender_clone.blocking_send(chunk).unwrap();

                    last_emit = Some(std::time::Instant::now());
                    true
                };
                let callback_fn = Box::new(callback_fn);

                gpt.context
                    .decode(initial_prompt.clone(), Some(callback_fn))
                    .unwrap();

                let session_dump_size = if let Some(dump_session) = req.dump_session {
                    if dump_session {
                        let start = std::time::Instant::now();
                        gpt.context
                            .save_session_file(&session_file_path, &tokens)
                            .unwrap();

                        let filesize = std::fs::metadata(&session_file_path).unwrap().len();
                        info!(
                            "Dumped llama.cpp session to {:?} in {}s ({})",
                            session_file_path,
                            start.elapsed().as_secs(),
                            bytesize::ByteSize(filesize)
                        );

                        Some(filesize as usize)
                    } else {
                        None
                    }
                } else {
                    None
                };

                let chunk = Chunk::Epilogue(Epilogue {
                    session_loaded: Some(false),
                    session_dump_size,
                    context_length,
                });
                sender.blocking_send(chunk).unwrap();
            }
        });
    } else {
        let chunk = Chunk::Epilogue(Epilogue {
            session_loaded: None,
            session_dump_size: None,
            context_length: 0,
        });
        sender.send(chunk).await?;
    }

    let stream = tokio_stream::wrappers::ReceiverStream::new(receiver);
    let stream_body = StreamBodyAsOptions::new().json_nl(stream);

    Ok(stream_body.into_response())
}
