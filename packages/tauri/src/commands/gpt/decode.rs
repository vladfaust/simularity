use std::time::Instant;

use tauri::Emitter;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEventPayload {
    pub progress: f32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New context length.
    context_length: u32,
}

#[tauri::command]
/// Decode prompt, updating the KV cache.
pub async fn gpt_decode(
    session_id: &str,
    prompt: &str,
    callback_event_name: Option<&str>,
    window: tauri::Window,
) -> Result<Response, tauri::ipc::InvokeError> {
    println!(
        "gpt_decode(session_id: {}, callback_event_name: {})",
        session_id,
        callback_event_name.unwrap_or("None"),
    );

    let session_id = session_id.parse::<u32>().map_err(|_| {
        tauri::ipc::InvokeError::from(format!("Invalid session ID: {}", session_id))
    })?;

    let progress_callback = if let Some(event_name) = callback_event_name.as_ref() {
        let throttle = std::time::Duration::from_millis(500);
        let mut last_emit: Option<Instant> = None;

        Some(move |progress: f32| -> bool {
            // Throttle the event emission.
            if let Some(last_emit) = last_emit {
                if last_emit.elapsed() < throttle {
                    return true;
                }
            }

            let payload = ProgressEventPayload { progress };

            window.emit(event_name, payload).unwrap();
            last_emit = Some(std::time::Instant::now());

            true
        })
    } else {
        None
    };

    let start = Instant::now();
    let decode_result = simularity_core::gpt::decode(session_id, prompt, progress_callback);

    if let Err(err) = decode_result {
        match err {
            simularity_core::gpt::decode::Error::SessionNotFound => {
                return Err(tauri::ipc::InvokeError::from("Session not found"));
            }
            simularity_core::gpt::decode::Error::ContextOverflow => {
                return Err(tauri::ipc::InvokeError::from("Context overflow"));
            }
            simularity_core::gpt::decode::Error::Unknown(code) => {
                return Err(tauri::ipc::InvokeError::from(format!(
                    "Unknown error code {}",
                    code
                )));
            }
        }
    }

    Ok(Response {
        duration: start.elapsed().as_millis() as u32,
        context_length: decode_result.unwrap(),
    })
}
