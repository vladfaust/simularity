use std::borrow::BorrowMut;

use app::static_box;
use simularity_core::GptModel;

use crate::{AppState, GptInstance, GptType};

#[tauri::command]
/// Initialize a GPT instance of `gpt_type`, replacing the current instance.
pub async fn gpt_init(
    gpt_type: GptType,
    model_path: String,
    context_size: u32,
    batch_size: usize,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!(
        "gpt_init(gpt_type: {:?}, model_path: {}, context_size: {})",
        gpt_type, model_path, context_size
    );

    let mut locked = match gpt_type {
        GptType::Writer => state.writer.lock().await,
        GptType::Director => state.director.lock().await,
    };

    let model_ref = get_or_create_model_ref(model_path, &state).await?;

    let instance = GptInstance {
        context: simularity_core::GptContext::new(
            &state.gpt_backend,
            model_ref,
            context_size,
            batch_size,
            None,
        )
        .map_err(tauri::InvokeError::from_anyhow)?,
    };

    locked.replace(instance);

    Ok(())
}

#[tauri::command]
/// Clear the GPT context.
pub async fn gpt_clear(
    gpt_type: GptType,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_clear(gpt_type: {:?})", gpt_type);

    let mut locked = match gpt_type {
        GptType::Writer => state.writer.lock().await,
        GptType::Director => state.director.lock().await,
    };

    let gpt: &mut GptInstance = locked
        .borrow_mut()
        .as_mut()
        .ok_or_else(|| tauri::InvokeError::from("GPT not initialized"))?;

    simularity_core::clear(&mut gpt.context).map_err(tauri::InvokeError::from_anyhow)
}

#[tauri::command]
/// Decode prompt with the writer.
pub async fn gpt_decode(
    gpt_type: GptType,
    prompt: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_decode(gpt_type: {:?})", gpt_type);

    let mut locked = match gpt_type {
        GptType::Writer => state.writer.lock().await,
        GptType::Director => state.director.lock().await,
    };

    let gpt: &mut GptInstance = locked
        .borrow_mut()
        .as_mut()
        .ok_or_else(|| tauri::InvokeError::from("GPT not initialized"))?;

    simularity_core::decode(&mut gpt.context, prompt).map_err(tauri::InvokeError::from_anyhow)
}

#[tauri::command]
/// Predict text.
pub async fn gpt_infer(
    gpt_type: GptType,
    prompt: Option<&str>,
    n_eval: usize,
    options: simularity_core::InferOptions,
    state: tauri::State<'_, AppState>,
) -> Result<String, tauri::InvokeError> {
    println!(
        "gpt_infer(gpt_type: {:?}, prompt: {}, n_eval: {}, options: {:?})",
        gpt_type,
        if prompt.is_some() { "Some(_)" } else { "None" },
        n_eval,
        options
    );

    let mut locked = match gpt_type {
        GptType::Writer => state.writer.lock().await,
        GptType::Director => state.director.lock().await,
    };

    let gpt: &mut GptInstance = locked
        .borrow_mut()
        .as_mut()
        .ok_or_else(|| tauri::InvokeError::from("GPT not initialized"))?;

    simularity_core::infer(&mut gpt.context, prompt, n_eval, options)
        .map_err(tauri::InvokeError::from_anyhow)
}

async fn get_or_create_model_ref(
    model_path: String,
    state: &AppState,
) -> Result<&'static GptModel, tauri::InvokeError> {
    let mut locked = state.gpt_models.lock().await;

    if let Some(model) = locked.get(&model_path) {
        return Ok(model.1);
    }

    let (model_box, model_ref) = unsafe {
        static_box(
            simularity_core::init_model(&state.gpt_backend, &model_path)
                .map_err(tauri::InvokeError::from_anyhow)?,
        )
    };

    locked.insert(model_path.to_string(), (model_box, model_ref));

    Ok(model_ref)
}
