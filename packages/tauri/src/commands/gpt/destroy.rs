#[tauri::command]
/// Destroy a GPT instance by ID.
/// Errors if the instance does not exist.
// TODO: Destroy the model if it is not used by any other instances.
pub async fn gpt_destroy(session_id: &str) -> Result<(), tauri::ipc::InvokeError> {
    println!("gpt_destroy(session_id: {})", session_id);

    let session_id = session_id
        .parse::<u32>()
        .map_err(|_| tauri::ipc::InvokeError::from(format!("Invalid session ID: {}", session_id)))?;

    simularity_core::gpt::destroy(session_id).map_err(|e| match e {
        simularity_core::gpt::destroy::Error::SessionNotFound => {
            tauri::ipc::InvokeError::from("Session not found")
        }
        simularity_core::gpt::destroy::Error::Unknown(code) => {
            tauri::ipc::InvokeError::from(format!("Unknown error code {}", code))
        }
    })
}
