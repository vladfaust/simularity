use std::borrow::BorrowMut;

use crate::{AppState, GptInstance};

/// Initialize a GPT model.
#[tauri::command]
pub async fn gpt_init(
    model_path: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    let mut locked = state.gpt_instance.lock().await;

    if locked.borrow_mut().is_some() {
        // TODO: Replace with a new model instead of returning an error.
        return Err(tauri::InvokeError::from("GPT already initialized"));
    } else {
        // See https://stackoverflow.com/a/69889137/3645337 for the leak hack.
        let model = Box::new(
            simularity_core::init_model(&state.gpt_backend, model_path)
                .map_err(tauri::InvokeError::from_anyhow)?,
        );
        let model = std::boxed::Box::<simularity_core::GptModel>::leak(model);

        let instance = GptInstance {
            model,
            context: simularity_core::init_ctx(&state.gpt_backend, model, 2048, None)
                .map_err(tauri::InvokeError::from_anyhow)?,
        };

        locked.replace(instance);
    }

    Ok(())
}

#[tauri::command]
/// Predict text.
pub async fn gpt_predict(
    prompt: String,
    n_eval: u32,
    stop_sequences: Option<Vec<String>>,
    temperature: Option<f32>,
    state: tauri::State<'_, AppState>,
) -> Result<String, tauri::InvokeError> {
    let options = simularity_core::InferOptions {
        stop_sequences: stop_sequences.unwrap_or_default(),
        temperature: temperature.unwrap_or(0.7),
        batch_size: 2048,
    };

    let mut locked = state.gpt_instance.lock().await;

    let instance: &mut GptInstance = locked
        .borrow_mut()
        .as_mut()
        .ok_or_else(|| tauri::InvokeError::from("GPT not initialized"))?;

    simularity_core::infer(&mut instance.context, prompt, n_eval, options)
        .map_err(tauri::InvokeError::from_anyhow)
}
