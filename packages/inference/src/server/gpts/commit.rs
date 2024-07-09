use crate::server::AppError;
use axum::{extract::Path, Json};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResponseBody {
    /// New context length in tokens.
    context_length: u32,
}

/// Commit a recently inferred prompt.
/// Path: `POST /gpts/:id/commit`.
#[axum::debug_handler]
pub async fn handler(Path(id): Path<u32>) -> Result<Json<CommitResponseBody>, AppError> {
    let context_length =
        tokio::task::spawn_blocking(move || simularity_core::gpt::commit(id)).await?;

    if let Err(err) = context_length {
        return match err {
            simularity_core::gpt::CommitError::SessionNotFound => {
                Err(AppError(anyhow::anyhow!("Session not found")))
            }
            simularity_core::gpt::CommitError::Unknown(code) => {
                panic!("Unknown error code: {}", code)
            }
        };
    }

    let body = Json(CommitResponseBody {
        context_length: context_length.unwrap(),
    });

    Ok(body)
}
