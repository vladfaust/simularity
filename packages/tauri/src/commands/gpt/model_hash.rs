#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    xx64_hash: String,
}

#[tauri::command]
/// Get the hash of a model with the given ID.
pub async fn gpt_model_hash_by_id(model_id: String) -> Result<Response, tauri::ipc::InvokeError> {
    println!("gpt_model_hash_by_id(model_id: {})", model_id);

    let result = simularity_core::model_get_hash_by_id(&model_id);

    match result {
        Err(err) => match err {
            simularity_core::ModelHashError::Unknown(code) => Err(tauri::ipc::InvokeError::from(
                format!("Model hashing failed with unhandled code {}", code),
            )),
        },
        Ok(ok) => Ok(Response {
            // Format the hash as a hex string.
            xx64_hash: format!("{:x}", ok),
        }),
    }
}

#[tauri::command]
/// Get the hash of a model with the given ID.
pub async fn gpt_model_hash_by_path(
    model_path: String,
) -> Result<Response, tauri::ipc::InvokeError> {
    println!("gpt_model_hash_by_path(model_path: {})", model_path);

    let result = simularity_core::model_get_hash_by_path(&model_path);

    match result {
        Err(err) => match err {
            simularity_core::ModelHashError::Unknown(code) => Err(tauri::ipc::InvokeError::from(
                format!("Model hashing failed with unhandled code {}", code),
            )),
        },
        Ok(ok) => Ok(Response {
            // Format the hash as a hex string.
            xx64_hash: format!("{:x}", ok),
        }),
    }
}
