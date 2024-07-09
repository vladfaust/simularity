use crate::AppState;

#[tauri::command]
/// Return whether a GPT instance with the given ID exists.
pub async fn gpt_find(
    session_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<bool, tauri::InvokeError> {
    println!("gpt_find(session_id: {})", session_id);

    let session_id = session_id
        .parse::<u32>()
        .map_err(|_| tauri::InvokeError::from(format!("Invalid session ID: {}", session_id)))?;

    let hash_map_lock = state.gpt_sessions.lock().await;
    Ok(hash_map_lock.contains_key(&session_id))
}
