use crate::AppState;

#[tauri::command]
/// Destroy all GPT instances and unload all the models.
pub async fn gpt_reset(state: tauri::State<'_, AppState>) -> Result<(), tauri::InvokeError> {
    println!("gpt_destroy()");

    let mut hash_map_lock = state.gpt_instances.lock().await;
    hash_map_lock.clear();

    let mut models_lock = state.gpt_models.lock().await;
    models_lock.clear();

    Ok(())
}
