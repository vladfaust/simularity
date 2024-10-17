use sha2::{Digest, Sha256};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    model_id: String,
    size: u64,
    n_params: u64,
    n_ctx_train: i64,
}

#[tauri::command]
/// Load a model at path, returning the path hash as the model ID.
/// Can be called multiple times with the same model path.
pub async fn gpt_load_model(model_path: String) -> Result<Response, tauri::ipc::InvokeError> {
    println!("gpt_load_model(model_path: {})", model_path);

    let mut hasher = Sha256::new();
    hasher.update(model_path.as_bytes());
    let model_id = format!("{:x}", hasher.finalize());

    let model_load_result =
        simularity_core::model_load(&model_path, &model_id, None::<fn(_) -> bool>);

    match model_load_result {
        Err(err) => match err {
            simularity_core::ModelLoadError::LoadFailed => {
                Err(tauri::ipc::InvokeError::from("Model load failed"))
            }
            simularity_core::ModelLoadError::Unknown(code) => Err(tauri::ipc::InvokeError::from(
                format!("Model load failed with unhandled code {}", code),
            )),
        },
        Ok(ok) => Ok(Response {
            model_id,
            n_params: ok.n_params,
            size: ok.size,
            n_ctx_train: ok.n_ctx_train,
        }),
    }
}
