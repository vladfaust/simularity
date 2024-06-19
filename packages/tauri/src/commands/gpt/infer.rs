use simularity_core::gpt;

use crate::AppState;

#[tauri::command]
/// Predict text.
/// If not committed afterwards, then the resulting KV cache updates
/// will be discarded (as if there was no inference).
pub async fn gpt_infer(
    gpt_id: &str,
    prompt: Option<&str>,
    n_eval: usize,
    options: gpt::InferOptions,
    state: tauri::State<'_, AppState>,
) -> Result<String, tauri::InvokeError> {
    println!(
        "gpt_infer(gpt_id: {:?}, prompt: {}, n_eval: {})",
        gpt_id,
        if prompt.is_some() { "Some(_)" } else { "None" },
        n_eval
    );

    let mut hash_map_lock = state.gpt_instances.lock().await;

    let arc = hash_map_lock
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?
        .clone();

    drop(hash_map_lock);

    // ADHOC: Limit the number of simultaneous inferences to 1.
    let inference_lock = state.inference_mutex.lock().await;
    let mut gpt = arc.lock().await;

    let result = gpt
        .context
        .infer(prompt, n_eval, options)
        .map_err(tauri::InvokeError::from_anyhow);

    drop(inference_lock);
    result
}
