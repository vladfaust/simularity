use axum::{
    routing::{delete, post},
    Router,
};
use simularity_core::gpt;
use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc},
};

use super::AppState;

pub mod abort_inference;
pub mod commit;
pub mod create;
pub mod decode;
pub mod delete;
pub mod infer;
pub mod reset;
pub mod token_count;

pub struct GptInstance {
    pub model: &'static gpt::Model,
    pub context: gpt::Context<'static>,
    pub initial_prompt_len: usize,
}

pub struct GptState {
    pub backend: gpt::Backend,
    pub model: &'static gpt::Model,

    /// {id => GptInstance}.
    pub instances: tokio::sync::Mutex<HashMap<String, Arc<std::sync::Mutex<GptInstance>>>>,

    /// {id => abortion_flag}.
    pub abortion_flags: tokio::sync::Mutex<HashMap<String, AtomicBool>>,
}

impl GptState {
    pub fn new(model_path: &str) -> Self {
        let gpt_backend = gpt::Backend::new().expect("unable to create the llama backend");

        // SAFETY: The model lives throughout the lifetime of the application.
        let gpt_model = {
            std::boxed::Box::leak(Box::new(
                gpt::Model::new(&gpt_backend, model_path).expect("unable to create GPT model"),
            ))
        };

        GptState {
            backend: gpt_backend,
            model: gpt_model,
            instances: tokio::sync::Mutex::new(HashMap::new()),
            abortion_flags: tokio::sync::Mutex::new(HashMap::new()),
        }
    }
}

pub fn router() -> Router<std::sync::Arc<AppState>> {
    Router::new()
        .route("/gpts", post(create::handler))
        .route("/gpts/token-count", post(token_count::handler))
        .route("/gpts/:id/decode", post(decode::handler))
        .route("/gpts/:id/infer", post(infer::handler))
        .route("/gpts/:id/abort-inference", post(abort_inference::handler))
        .route("/gpts/:id/commit", post(commit::handler))
        .route("/gpts/:id/reset", post(reset::handler))
        .route("/gpts/:id", delete(delete::handler))
}
