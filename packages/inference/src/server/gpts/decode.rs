use crate::server::{AppError, AppState};
use axum::{
    extract::{Path, State},
    Json,
};
use log::{debug, info};
use sha2::{Digest, Sha256};
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeRequestBody {
    prompt: String,

    /// If true, would dump the GPT session
    /// named after the SHA-256 hash of the prompt alone,
    /// but only if the dump file does not exist yet.
    dump_session: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeResponseBody {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New KV cache size in tokens.
    kv_cache_size: usize,

    /// Session dump size in bytes, if dumped.
    session_dump_size: Option<usize>,
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
    let (kv_cache_size, session_dump_size) = tokio::task::spawn_blocking(move || {
        let mut gpt = arc.lock().unwrap();
        let _ = gpt.context.decode(req.prompt.clone());

        let mut session_dump_size: Option<usize> = None;
        if req.dump_session {
            let mut hasher = Sha256::new();
            hasher.update(req.prompt.as_bytes());
            let hash = format!("{:x}", hasher.finalize());

            let path = std::env::temp_dir().join(format!("{}.llama-session", hash));

            if path.exists() {
                debug!("llama.cpp session file already exists at {:?}", path);
            } else {
                let tokens = gpt.model.tokenize(&req.prompt);
                gpt.context.save_session_file(&path, &tokens).unwrap();

                let filesize = std::fs::metadata(&path).unwrap().len();
                info!(
                    "Dumped llama.cpp session to {:?} ({})",
                    path,
                    bytesize::ByteSize(filesize)
                );

                session_dump_size = Some(filesize as usize);
            }
        }

        (gpt.context.kv_cache_size(), session_dump_size)
    })
    .await?;

    let body = Json(DecodeResponseBody {
        duration: start.elapsed().as_millis() as u32,
        kv_cache_size,
        session_dump_size,
    });

    Ok(body)
}
