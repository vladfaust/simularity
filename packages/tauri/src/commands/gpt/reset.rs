use crate::AppState;

#[tauri::command]
/// Reset a GPT to its initial prompt.
/// If no initial prompt was set, the context will be cleared entirely.
pub async fn gpt_reset(
    gpt_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_reset(gpt_id: {:?})", gpt_id);

    let mut hash_map_lock = state.gpt_instances.lock().await;
    let arc = hash_map_lock
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?
        .clone();

    drop(hash_map_lock);
    let mut gpt = arc.lock().await;

    let from = gpt.initial_prompt_len;
    gpt.context
        .reset(from)
        .map_err(tauri::InvokeError::from_anyhow)?;

    Ok(())
}
