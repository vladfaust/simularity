use crate::server::AppError;
use axum::extract::Path;
use simularity_core::gpt::ResetError;

/// Reset a GPT to its initial prompt.
/// If no initial prompt was set, the context will be cleared entirely.
/// Path: `POST /gpts/:id/reset`.
#[axum::debug_handler]
pub async fn handler(Path(id): Path<u32>) -> Result<(), AppError> {
    let result = tokio::task::spawn_blocking(move || simularity_core::gpt::reset(id)).await?;

    if let Err(err) = result {
        return match err {
            ResetError::SessionNotFound => Err(AppError(anyhow::anyhow!("Session not found"))),
            ResetError::Unknown(code) => {
                panic!("Unknown error code: {}", code)
            }
        };
    }

    Ok(())
}
