use crate::server::{AppError, AppState};
use axum::{extract::State, Json};
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    prompt: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseBody {
    token_count: usize,
}

/// Count the number of tokens in a prompt.
/// Path: `POST /gpts/token-count`.
#[axum::debug_handler]
pub async fn handler(
    State(state): State<Arc<AppState>>,
    req: Json<RequestBody>,
) -> Result<Json<ResponseBody>, AppError> {
    let token_count = simularity_core::token_count(state.gpt.model, &req.prompt);
    Ok(Json(ResponseBody { token_count }))
}
