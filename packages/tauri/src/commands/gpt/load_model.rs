use sha2::{Digest, Sha256};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    model_id: String,
    train_context_size: u32,
}

#[tauri::command]
/// Load a model at path, returning the path hash as the model ID.
/// Can be called multiple times with the same model path.
pub async fn gpt_load_model(model_path: String) -> Result<Response, tauri::InvokeError> {
    println!("gpt_load_model(model_path: {})", model_path);

    let mut hasher = Sha256::new();
    hasher.update(model_path.as_bytes());
    let model_id = format!("{:x}", hasher.finalize());

    let model_load_result =
        simularity_core::model_load(&model_path, &model_id, None::<fn(_) -> bool>);

    if let Err(e) = model_load_result {
        match e {
            simularity_core::ModelLoadError::LoadFailed => {
                return Err(tauri::InvokeError::from("Model load failed"));
            }
            simularity_core::ModelLoadError::Unknown(code) => {
                return Err(tauri::InvokeError::from(format!(
                    "Model load failed with unhandled code {}",
                    code
                )));
            }
            simularity_core::ModelLoadError::ModelExists => {
                println!("Model already exists")
                // Continue.
            }
        }
    };

    Ok(Response {
        model_id,
        train_context_size: 0,
    })
}
