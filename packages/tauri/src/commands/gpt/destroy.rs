use crate::AppState;

#[tauri::command]
/// Destroy a GPT instance by ID.
/// Errors if the instance does not exist.
// TODO: Destroy the model if it is not used by any other instances.
pub async fn gpt_destroy(
    gpt_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_destroy(gpt_id: {:?})", gpt_id);

    let mut hash_map_lock = state.gpt_instances.lock().await;

    if !hash_map_lock.contains_key(gpt_id) {
        return Err(tauri::InvokeError::from("gpt does not exist"));
    }

    hash_map_lock.remove(gpt_id);

    Ok(())
}
