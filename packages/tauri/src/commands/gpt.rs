use app::static_box;
use simularity_core::GptModel;

use crate::{AppState, GptInstance};

#[tauri::command]
/// Initialize a new GPT instance, replacing the current, if any.
pub async fn gpt_init(
    gpt_id: &str,
    model_path: String,
    context_size: u32,
    batch_size: usize,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!(
        "gpt_init(gpt_id: {:?}, model_path: {}, context_size: {})",
        gpt_id, model_path, context_size
    );

    let mut locked = state.gpt_instances.lock().await;

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

    let old = locked.insert(gpt_id.to_string(), instance);
    if let Some(old) = old {
        println!("replaced gpt with id {}", gpt_id);
        drop(old);
    }

    Ok(())
}

#[tauri::command]
/// Clear the GPT context.
pub async fn gpt_clear(
    gpt_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_clear(gpt_id: {:?})", gpt_id);

    let mut locked = state.gpt_instances.lock().await;

    let gpt: &mut GptInstance = locked
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?;

    simularity_core::clear(&mut gpt.context).map_err(tauri::InvokeError::from_anyhow)
}

#[tauri::command]
/// Decode prompt with the writer.
pub async fn gpt_decode(
    gpt_id: &str,
    prompt: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_decode(gpt_id: {:?})", gpt_id);

    let mut locked = state.gpt_instances.lock().await;

    let gpt = locked
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?;

    simularity_core::decode(&mut gpt.context, prompt).map_err(tauri::InvokeError::from_anyhow)
}

#[tauri::command]
/// Predict text.
pub async fn gpt_infer(
    gpt_id: &str,
    prompt: Option<&str>,
    n_eval: usize,
    options: simularity_core::InferOptions,
    state: tauri::State<'_, AppState>,
) -> Result<String, tauri::InvokeError> {
    println!(
        "gpt_infer(gpt_id: {:?}, prompt: {}, n_eval: {}, options: {:?})",
        gpt_id,
        if prompt.is_some() { "Some(_)" } else { "None" },
        n_eval,
        options
    );

    let mut locked = state.gpt_instances.lock().await;

    let gpt = locked
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?;

    simularity_core::infer(&mut gpt.context, prompt, n_eval, options)
        .map_err(tauri::InvokeError::from_anyhow)
}

#[tauri::command]
/// Tokenize prompt and return the token count.
pub async fn gpt_token_count(
    model_path: String,
    prompt: &str,
    state: tauri::State<'_, AppState>,
) -> Result<usize, tauri::InvokeError> {
    let model_ref = get_or_create_model_ref(model_path, &state).await?;
    Ok(simularity_core::token_count(model_ref, prompt))
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

    locked.insert(model_path, (model_box, model_ref));

    Ok(model_ref)
}
