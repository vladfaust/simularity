use crate::server::AppError;
use axum::extract::Path;
use simularity_core::gpt::destroy::Error as DestroyError;

/// Destroy a GPT instance.
/// Path: `DELETE /gpts/:id`.
#[axum::debug_handler]
pub async fn handler(Path(id): Path<u32>) -> Result<(), AppError> {
    let result = tokio::task::spawn_blocking(move || simularity_core::gpt::destroy(id)).await?;

    if let Err(err) = result {
        return match err {
            DestroyError::SessionNotFound => Err(AppError(anyhow::anyhow!("Session not found"))),
            DestroyError::Unknown(code) => {
                panic!("Unknown error code: {}", code)
            }
        };
    }

    Ok(())
}
