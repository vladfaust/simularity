use simularity_core::gpt;
use simularity_tauri::static_box;

use crate::AppState;

pub mod commit;
mod common;
pub mod create;
pub mod decode;
pub mod destroy;
pub mod find;
pub mod infer;
pub mod load_model;
pub mod reset;
pub mod token_count;

async fn get_or_create_model_ref(
    model_path: String,
    state: &AppState,
) -> Result<&'static gpt::Model, tauri::InvokeError> {
    let mut locked = state.gpt_models.lock().await;

    if let Some(model) = locked.get(&model_path) {
        return Ok(model.1);
    }

    let (model_box, model_ref) = unsafe {
        static_box(
            gpt::Model::new(&state.gpt_backend, &model_path)
                .map_err(tauri::InvokeError::from_anyhow)?,
        )
    };

    locked.insert(model_path, (model_box, model_ref));

    Ok(model_ref)
}
