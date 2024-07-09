#[tauri::command]
/// Reset a GPT to its initial prompt.
/// If no initial prompt was set, the context will be cleared entirely.
/// Returns new context length.
pub async fn gpt_reset(session_id: &str) -> Result<u32, tauri::InvokeError> {
    println!("gpt_reset(session_id: {})", session_id);

    let session_id = session_id
        .parse::<u32>()
        .map_err(|_| tauri::InvokeError::from(format!("Invalid session ID: {}", session_id)))?;

    simularity_core::gpt::reset(session_id).map_err(|e| match e {
        simularity_core::gpt::ResetError::SessionNotFound => {
            tauri::InvokeError::from("Session not found")
        }
        simularity_core::gpt::ResetError::Unknown(code) => {
            tauri::InvokeError::from(format!("Unknown error code {}", code))
        }
    })
}
