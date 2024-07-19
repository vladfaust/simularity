use axum::{
    routing::{delete, post},
    Router,
};
use std::{collections::HashMap, sync::atomic::AtomicBool};

use super::AppState;
use crate::env::ENV;

pub mod abort_inference;
pub mod create;
pub mod decode;
pub mod destroy;
pub mod infer;

pub struct GptState {
    pub abort_flags: tokio::sync::Mutex<HashMap<u32, AtomicBool>>,
}

impl GptState {
    pub fn new() -> Self {
        simularity_core::model_load(
            &ENV.simularity_model_path,
            &ENV.simularity_model_id,
            None::<fn(_) -> bool>,
        )
        .expect("Failed to load model");

        GptState {
            abort_flags: tokio::sync::Mutex::new(HashMap::new()),
        }
    }
}

pub fn router() -> Router<std::sync::Arc<AppState>> {
    Router::new()
        .route("/gpts", post(create::handler))
        .route("/gpts/:id/decode", post(decode::handler))
        .route("/gpts/:id/infer", post(infer::handler))
        .route("/gpts/:id/abort-inference", post(abort_inference::handler))
        .route("/gpts/:id", delete(destroy::handler))
}
