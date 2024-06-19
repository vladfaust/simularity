use crate::AppState;

#[tauri::command]
/// Commit the latest inference update.
/// Returns the number of tokens committed.
pub async fn gpt_commit(
    gpt_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<usize, tauri::InvokeError> {
    println!("gpt_commit(gpt_id: {:?})", gpt_id);

    let mut hash_map_lock = state.gpt_instances.lock().await;
    let arc = hash_map_lock
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?
        .clone();

    drop(hash_map_lock);
    let mut gpt = arc.lock().await;

    gpt.context
        .commit()
        .map_err(tauri::InvokeError::from_anyhow)
}
