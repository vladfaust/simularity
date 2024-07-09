#[tauri::command]
/// Commit the latest inference update.
/// Returns new context length.
pub async fn gpt_commit(session_id: &str) -> Result<u32, tauri::InvokeError> {
    println!("gpt_commit(session_id: {})", session_id);

    let session_id = session_id
        .parse::<u32>()
        .map_err(|_| tauri::InvokeError::from(format!("Invalid session ID: {}", session_id)))?;

    simularity_core::gpt::commit(session_id).map_err(|e| match e {
        simularity_core::gpt::CommitError::SessionNotFound => {
            tauri::InvokeError::from("Session not found")
        }
        simularity_core::gpt::CommitError::Unknown(code) => {
            tauri::InvokeError::from(format!("Unknown error code {}", code))
        }
    })
}
