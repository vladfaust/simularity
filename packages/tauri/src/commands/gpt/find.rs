use crate::AppState;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    model_id: String,
}

#[tauri::command]
/// Return whether a GPT instance with the given ID exists.
pub async fn gpt_find(
    session_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Response>, tauri::ipc::InvokeError> {
    println!("gpt_find(session_id: {})", session_id);

    let session_id = session_id.parse::<u32>().map_err(|_| {
        tauri::ipc::InvokeError::from(format!("Invalid session ID: {}", session_id))
    })?;

    let hash_map_lock = state.gpt_sessions.lock().await;
    let model_id = hash_map_lock.get(&session_id);

    Ok(model_id.map(|model_id| Response {
        model_id: model_id.clone(),
    }))
}
