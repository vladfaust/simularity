use crate::{AppState, GptInstance};
use app::static_box;
use std::borrow::BorrowMut;

/// Initialize a GPT model.
#[tauri::command]
pub async fn gpt_init(
    model_path: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    let mut locked = state.gpt_instance.lock().await;

    let (model_box, model_ref) = unsafe {
        static_box(
            simularity_core::init_model(&state.gpt_backend, model_path)
                .map_err(tauri::InvokeError::from_anyhow)?,
        )
    };

    let instance = GptInstance {
        model: model_box,
        context: simularity_core::init_ctx(&state.gpt_backend, model_ref, 2048, None)
            .map_err(tauri::InvokeError::from_anyhow)?,
    };

    locked.replace(instance);

    Ok(())
}

#[tauri::command]
/// Predict text.
pub async fn gpt_predict(
    prompt: String,
    n_eval: u32,
    stop_sequences: Option<Vec<String>>,
    temperature: Option<f32>,
    grammar: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, tauri::InvokeError> {
    let options = simularity_core::InferOptions {
        stop_sequences,
        temperature,
        grammar,
    };

    let mut locked = state.gpt_instance.lock().await;

    let instance: &mut GptInstance = locked
        .borrow_mut()
        .as_mut()
        .ok_or_else(|| tauri::InvokeError::from("GPT not initialized"))?;

    simularity_core::infer(&mut instance.context, prompt, n_eval, options)
        .map_err(tauri::InvokeError::from_anyhow)
}
