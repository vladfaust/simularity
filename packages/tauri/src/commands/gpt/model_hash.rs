#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    xx64_hash: String,
}

#[tauri::command]
/// Get the hash of a model with the given ID.
pub async fn gpt_model_hash(model_id: String) -> Result<Response, tauri::InvokeError> {
    println!("gpt_model_hash(model_id: {})", model_id);

    let model_load_result = simularity_core::model_hash(&model_id);

    match model_load_result {
        Err(err) => match err {
            simularity_core::ModelHashError::Unknown(code) => Err(tauri::InvokeError::from(
                format!("Model hashing failed with unhandled code {}", code),
            )),
        },
        Ok(ok) => Ok(Response {
            // Format the hash as a hex string.
            xx64_hash: format!("{:x}", ok),
        }),
    }
}
