#[tauri::command]
/// Predict text.
pub async fn gpt_predict(
    model_path: String,
    prompt: String,
    n_eval: u32,
    stop_sequences: Option<Vec<String>>,
    temperature: Option<f32>,
) -> Result<String, tauri::InvokeError> {
    let options = simularity_core::InferOptions {
        seed: Some(0),
        n_ctx: 2048,
        stop_sequences: stop_sequences.unwrap_or_default(),
        threads: None,
        threads_batch: None,
        temperature: temperature.unwrap_or(0.7),
        batch_size: 2048,
    };

    simularity_core::infer(model_path, prompt, n_eval, options)
        .map_err(tauri::InvokeError::from_anyhow)
}
