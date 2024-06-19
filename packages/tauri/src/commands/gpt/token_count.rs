use super::get_or_create_model_ref;
use crate::AppState;

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
