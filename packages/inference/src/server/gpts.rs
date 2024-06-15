use axum::{
    routing::{delete, post},
    Router,
};
use simularity_core::{GptBackend, GptContext, GptModel};
use std::{collections::HashMap, sync::Arc};

use super::AppState;

pub mod commit;
pub mod create;
pub mod decode;
pub mod delete;
pub mod infer;
pub mod token_count;

pub struct GptInstance {
    pub context: GptContext<'static>,
}

pub struct GptState {
    pub backend: GptBackend,
    pub model: &'static GptModel,

    /// {id => GptInstance}.
    pub instances: tokio::sync::Mutex<HashMap<String, Arc<std::sync::Mutex<GptInstance>>>>,
}

impl GptState {
    pub fn new(model_path: &str) -> Self {
        let gpt_backend =
            simularity_core::init_backend().expect("unable to create the llama backend");

        // SAFETY: The model lives throughout the lifetime of the application.
        let gpt_model = {
            std::boxed::Box::leak(Box::new(
                simularity_core::init_model(&gpt_backend, model_path)
                    .expect("unable to create GPT model"),
            ))
        };

        GptState {
            backend: gpt_backend,
            model: gpt_model,
            instances: tokio::sync::Mutex::new(HashMap::new()),
        }
    }
}

pub fn router() -> Router<std::sync::Arc<AppState>> {
    Router::new()
        .route("/gpts", post(create::handler))
        .route("/gpts/token-count", post(token_count::handler))
        .route("/gpts/:id/decode", post(decode::handler))
        .route("/gpts/:id/infer", post(infer::handler))
        .route("/gpts/:id/commit", post(commit::handler))
        .route("/gpts/:id", delete(delete::handler))
}
