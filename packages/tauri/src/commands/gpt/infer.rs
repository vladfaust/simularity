use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use crate::AppState;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DecodeProgressEventPayload {
    pub progress: f32,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InferenceEventPayload {
    pub content: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub result: String,
    pub input_context_length: u32,
    pub output_context_length: u32,
}

const ABORT_SIGNAL: &str = "app://gpt/abort-inference";

#[allow(clippy::too_many_arguments)]
#[tauri::command]
/// Predict the next token(s) given a prompt.
pub async fn gpt_infer(
    session_id: &str,
    prompt: Option<&str>,
    n_eval: u32,
    options: Option<simularity_core::gpt::infer::Options>,
    decode_callback_event_name: Option<&str>,
    inference_callback_event_name: Option<&str>,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<Response, tauri::InvokeError> {
    println!(
        "gpt_infer(gpt_id: {}, prompt: {}, n_eval: {})",
        session_id,
        if prompt.is_some() { "Some" } else { "None" },
        n_eval
    );

    let session_id = session_id
        .parse::<u32>()
        .map_err(|_| tauri::InvokeError::from(format!("Invalid session ID: {}", session_id)))?;

    let hash_map_lock = state.gpt_sessions.lock().await;
    let model_id = hash_map_lock.get(&session_id);
    if model_id.is_none() {
        return Err(tauri::InvokeError::from("Session not found"));
    }
    let model_id = model_id.unwrap();

    // OPTIMIZE: Use a more efficient way to abort the inference,
    // as we're always in the same thread?
    let aborted = Arc::new(Mutex::new(false));
    let aborted_clone = aborted.clone();
    // NOTE: A string is wrapped in quotes in an event payload.
    let session_id_str = format!("\"{}\"", session_id);
    window.listen(ABORT_SIGNAL, move |event| {
        println!("⚠️ Received abort signal: {:?}", event);

        if let Some(payload) = event.payload() {
            if session_id_str.eq(&payload) {
                println!("Aborting inference");
                *aborted_clone.lock().unwrap() = true;
            }
        }
    });

    let window_clone = window.clone();
    let mut resulting_string = String::new();
    let inference_callback = Some(|content: &str| -> bool {
        resulting_string.push_str(content);

        if let Some(event_name) = inference_callback_event_name.as_ref() {
            window_clone
                .emit(
                    event_name,
                    InferenceEventPayload {
                        content: content.to_string(),
                    },
                )
                .unwrap();
        }

        !*aborted.lock().unwrap()
    });

    let decode_progress_callback = if let Some(event_name) = decode_callback_event_name.as_ref() {
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        Some(move |progress| -> bool {
            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let payload = DecodeProgressEventPayload { progress };

            window.emit(event_name, payload).unwrap();
            last_emit = Some(std::time::Instant::now());

            true
        })
    } else {
        None
    };

    let input_token_length = if let Some(prompt) = prompt {
        simularity_core::gpt::token_length(model_id, prompt)
    } else {
        Ok(0)
    };

    if let Err(error) = input_token_length {
        match error {
            simularity_core::gpt::token_length::Error::ModelNotFound => {
                return Err(tauri::InvokeError::from("Model not found"))
            }
            simularity_core::gpt::token_length::Error::Unknown(code) => {
                return Err(tauri::InvokeError::from(format!(
                    "Unknown error code {}",
                    code
                )))
            }
        }
    }

    let input_token_length = input_token_length.unwrap();

    let inference_result = simularity_core::gpt::infer(
        session_id,
        prompt,
        n_eval,
        options,
        decode_progress_callback,
        inference_callback,
    );

    if let Ok(new_context_length) = inference_result {
        Ok(Response {
            result: resulting_string,
            input_context_length: input_token_length,
            output_context_length: new_context_length - input_token_length,
        })
    } else {
        match inference_result.unwrap_err() {
            simularity_core::gpt::infer::Error::SessionNotFound => {
                Err(tauri::InvokeError::from("Session not found"))
            }
            simularity_core::gpt::infer::Error::ContextOverflow => {
                Err(tauri::InvokeError::from("Context overflow"))
            }
            simularity_core::gpt::infer::Error::Unknown(code) => Err(tauri::InvokeError::from(
                format!("Unknown error code {}", code),
            )),
        }
    }
}
