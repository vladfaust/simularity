use simularity_core::gpt;
use simularity_tauri::static_box;
use std::sync::Arc;
use tauri::async_runtime::Mutex;

use crate::{AppState, GptInstance};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelParams {
    train_context_size: u32,
}

#[tauri::command]
/// Load a model at path.
pub async fn gpt_load_model(
    model_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ModelParams, tauri::InvokeError> {
    println!("gpt_load_model(model_path: {:?})", model_path);

    let model_ref = get_or_create_model_ref(model_path.clone(), &state).await?;

    Ok(ModelParams {
        train_context_size: model_ref.n_ctx_train(),
    })
}

#[tauri::command]
/// Find or create a new GPT instance, returning its KV cache key.
/// NOTE: Changing any parameter will replace the instance.
/// NOTE: Creating a new instance locks the entire GPT hash map.
pub async fn gpt_find_or_create(
    gpt_id: String,
    model_path: String,
    context_size: u32,
    batch_size: usize,
    state: tauri::State<'_, AppState>,
) -> Result<String, tauri::InvokeError> {
    println!(
        "gpt_find_or_create(gpt_id: {:?}, model_path: {}, context_size: {}, batc_size: {})",
        gpt_id, model_path, context_size, batch_size
    );

    let mut hash_map_lock = state.gpt_instances.lock().await;

    if let Some(arc) = hash_map_lock.get(&gpt_id) {
        let gpt = arc.lock().await;

        if (gpt.model_path == model_path)
            && (gpt.context_size == context_size)
            && (gpt.batch_size == batch_size)
        {
            return Ok(gpt.kv_cache_key.clone());
        }
    }

    let model_ref = get_or_create_model_ref(model_path.clone(), &state).await?;

    let instance = GptInstance {
        model_path,
        context_size,
        batch_size,
        context: gpt::Context::new(
            &state.gpt_backend,
            model_ref,
            context_size,
            batch_size,
            None,
        )
        .map_err(tauri::InvokeError::from_anyhow)?,
        kv_cache_key: String::new(),
    };

    hash_map_lock.insert(gpt_id, Arc::new(Mutex::new(instance)));

    Ok(String::new())
}

#[tauri::command]
/// Reset the GPT context. Will also clear the KV cache key.
pub async fn gpt_reset(
    gpt_id: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("gpt_reset(gpt_id: {:?})", gpt_id);

    let hash_map_lock = state.gpt_instances.lock().await;

    let arc = hash_map_lock
        .get(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?
        .clone();

    drop(hash_map_lock);
    let mut gpt = arc.lock().await;

    gpt.kv_cache_key.clear();
    gpt.context.reset().map_err(tauri::InvokeError::from_anyhow)
}

#[tauri::command]
/// Decode prompt, updating the KV cache.
/// New KV cache key value must be provided.
// TODO: Return new KV cache size.
pub async fn gpt_decode(
    gpt_id: &str,
    prompt: String,
    new_kv_cache_key: &str,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!(
        "gpt_decode(gpt_id: {:?}, new_kv_cache_key: {})",
        gpt_id, new_kv_cache_key
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
        .decode(prompt)
        .map_err(tauri::InvokeError::from_anyhow);
    gpt.kv_cache_key = new_kv_cache_key.to_string();

    drop(inference_lock);
    result
}

#[tauri::command]
/// Predict text. If not committed, the resulting KV cache updates will be discarded.
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

#[tauri::command]
/// Commit the latest inference KV cache update.
/// Requires a new KV cache key value.
/// Returns the number of tokens committed.
pub async fn gpt_commit(
    gpt_id: &str,
    new_kv_cache_key: &str,
    state: tauri::State<'_, AppState>,
) -> Result<usize, tauri::InvokeError> {
    println!(
        "gpt_commit(gpt_id: {:?}, new_kv_cache_key: {})",
        gpt_id, new_kv_cache_key
    );

    let mut hash_map_lock = state.gpt_instances.lock().await;
    let arc = hash_map_lock
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?
        .clone();

    drop(hash_map_lock);
    let mut gpt = arc.lock().await;

    let result = gpt
        .context
        .commit()
        .map_err(tauri::InvokeError::from_anyhow);
    gpt.kv_cache_key = new_kv_cache_key.to_string();

    result
}

#[tauri::command]
/// Tokenize prompt and return the token count.
pub async fn gpt_token_count(
    model_path: String,
    prompt: &str,
    state: tauri::State<'_, AppState>,
) -> Result<usize, tauri::InvokeError> {
    let model_ref = get_or_create_model_ref(model_path, &state).await?;
    Ok(model_ref.token_count(prompt))
}

async fn get_or_create_model_ref(
    model_path: String,
    state: &AppState,
) -> Result<&'static gpt::Model, tauri::InvokeError> {
    let mut locked = state.gpt_models.lock().await;

    if let Some(model) = locked.get(&model_path) {
        return Ok(model.1);
    }

    let (model_box, model_ref) = unsafe {
        static_box(
            gpt::Model::new(&state.gpt_backend, &model_path)
                .map_err(tauri::InvokeError::from_anyhow)?,
        )
    };

    locked.insert(model_path, (model_box, model_ref));

    Ok(model_ref)
}
