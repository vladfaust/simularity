use crate::server::AppState;
use axum::{
    extract::{Path, State},
    response::IntoResponse,
};
use reqwest::StatusCode;
use std::sync::Arc;

/// Abort an ongoing inference by GPT id.
/// Path: `POST /gpts/:id/abort-inference`.
///
/// # Returns
///
/// * 204 No Content if the abortion was successful.
/// * 409 Conflict if the abortion is already in progress.
/// * 404 Not Found if the GPT instance does not exist.
///
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let hash_map_lock = state.gpt.abortion_flags.lock().await;
    let abortion_flag = hash_map_lock.get(&id);
    if let Some(abortion_flag) = abortion_flag {
        let previous = abortion_flag.swap(true, std::sync::atomic::Ordering::Relaxed);
        if previous {
            (StatusCode::CONFLICT).into_response()
        } else {
            (StatusCode::NO_CONTENT).into_response()
        }
    } else {
        (StatusCode::NOT_FOUND, "gpt not found").into_response()
    }
}
