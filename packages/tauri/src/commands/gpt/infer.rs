use simularity_core::gpt;
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use super::common::DecodeProgress;
use crate::AppState;

#[derive(serde::Serialize, Clone)]
struct InferenceEventPayload {
    content: String,
}

const ABORT_SIGNAL: &str = "app://gpt/abort-inference";

#[tauri::command]
/// Predict text.
///
/// If not committed afterwards, then the resulting KV cache updates
/// will be discarded (as if there was no inference).
///
/// If `event_name` is provided, then the inference results will be
/// emitted as events with the given name.
pub async fn gpt_infer(
    gpt_id: &str,
    prompt: Option<&str>,
    n_eval: usize,
    options: gpt::InferOptions,
    decode_callback_event_name: Option<String>,
    inference_callback_event_name: Option<String>,
    state: tauri::State<'_, AppState>,
    window: tauri::Window,
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

    // OPTIMIZE: Use a more efficient way to abort the inference,
    // as we're always in the same thread?
    let aborted = Arc::new(Mutex::new(false));
    let aborted_clone = aborted.clone();
    let gpt_id_quoted = format!("\"{}\"", gpt_id);
    window.listen(ABORT_SIGNAL, move |event| {
        println!("⚠️ Received abort signal: {:?}", event);

        if let Some(payload) = event.payload() {
            if gpt_id_quoted.eq(&payload) {
                println!("Aborting inference");
                *aborted_clone.lock().unwrap() = true;
            }
        }
    });

    let window_clone = window.clone();
    let inference_callback = inference_callback_event_name.map(|event_name| {
        move |content: &str| -> bool {
            let payload = InferenceEventPayload {
                content: content.to_string(),
            };

            window_clone.emit(&event_name, payload).unwrap();
            *aborted.lock().unwrap()
        }
    });

    let result = if let Some(event_name) = decode_callback_event_name.as_ref() {
        let total_tokens = if let Some(prompt) = prompt {
            gpt.model.tokenize(prompt).len()
        } else {
            0
        };

        let event_name = event_name.clone();
        let mut cur_node: usize = 0;
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        let decode_callback = move || -> bool {
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

        let decode_callback = Box::new(decode_callback);

        gpt.context
            .infer(
                prompt,
                n_eval,
                options,
                Some(decode_callback),
                inference_callback,
            )
            .map_err(tauri::InvokeError::from_anyhow)
    } else {
        gpt.context
            .infer(prompt, n_eval, options, None, inference_callback)
            .map_err(tauri::InvokeError::from_anyhow)
    };

    drop(inference_lock);
    result
}
