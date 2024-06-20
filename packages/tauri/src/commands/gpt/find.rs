use crate::AppState;

#[tauri::command]
/// Return whether a GPT instance with the given ID exists.
pub async fn gpt_find(
    gpt_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, tauri::InvokeError> {
    let hash_map_lock = state.gpt_instances.lock().await;
    Ok(hash_map_lock.contains_key(&gpt_id))
}
