use super::get_or_create_model_ref;
use crate::AppState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    train_context_size: u32,
}

#[tauri::command]
/// Load a model at path.
pub async fn gpt_load_model(
    model_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Response, tauri::InvokeError> {
    println!("gpt_load_model(model_path: {:?})", model_path);

    let model_ref = get_or_create_model_ref(model_path.clone(), &state).await?;

    Ok(Response {
        train_context_size: model_ref.n_ctx_train(),
    })
}
