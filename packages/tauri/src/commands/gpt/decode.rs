use std::time::Instant;

use super::common::DecodeProgress;
use crate::AppState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New KV cache size in tokens.
    kv_cache_size: usize,
}

#[tauri::command]
/// Decode prompt, updating the KV cache.
pub async fn gpt_decode(
    gpt_id: &str,
    prompt: String,
    callback_event_name: Option<String>,
    state: tauri::State<'_, AppState>,
    window: tauri::Window,
) -> Result<Response, tauri::InvokeError> {
    println!(
        "gpt_decode(gpt_id: {:?}, callback_event_name: {})",
        gpt_id,
        callback_event_name.as_deref().unwrap_or("None"),
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

    let start = std::time::Instant::now();
    let tokens = gpt.model.tokenize(&prompt);

    if let Some(event_name) = callback_event_name.as_ref() {
        let event_name = event_name.clone();
        let mut cur_node: usize = 0;
        let total_tokens = tokens.len();
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        let callback_fn = move || -> bool {
            cur_node += 1;

            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let payload = DecodeProgress {
                progress: cur_node as f32 / (total_tokens as f32 * 2.0),
            };

            window.emit(&event_name, payload).unwrap();
            last_emit = Some(std::time::Instant::now());

            true
        };
        let callback_fn = Box::new(callback_fn);

        gpt.context
            .decode(prompt.clone(), Some(callback_fn))
            .map_err(tauri::InvokeError::from_anyhow)?;
    } else {
        gpt.context
            .decode(prompt.clone(), None)
            .map_err(tauri::InvokeError::from_anyhow)?;
    }

    let kv_cache_size = gpt.context.kv_cache_size();
    drop(inference_lock);

    Ok(Response {
        duration: start.elapsed().as_millis() as u32,
        kv_cache_size,
    })
}
