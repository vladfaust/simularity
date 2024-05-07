#[tauri::command]
/// Predict text.
pub fn gpt_predict(
    model_path: String,
    prompt: String,
    n_len: u32,
) -> Result<String, tauri::InvokeError> {
    let threads: Option<u32> = None;
    let threads_batch: Option<u32> = None;
    let seed: Option<u32> = Some(0);
    let n_ctx: Option<u32> = Some(2048);

    simularity_core::infer(
        model_path,
        n_ctx,
        n_len,
        seed,
        prompt,
        threads,
        threads_batch,
    )
    .map_err(tauri::InvokeError::from_anyhow)
}
