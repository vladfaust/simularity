use anyhow::{Context, Ok, Result};
use llama_cpp_2::{
    model::{params::LlamaModelParams, AddBos, LlamaModel},
    token::LlamaToken,
};

use super::backend::Backend;

pub struct Model(pub LlamaModel);

impl Model {
    pub fn new(backend: &Backend, model_path: &str) -> Result<Self> {
        let model_params = LlamaModelParams::default();

        Ok(Self(
            LlamaModel::load_from_file(&backend.0, model_path, &model_params)
                .with_context(|| format!("unable to load model from {0}", model_path))?,
        ))
    }

    /// Get the context size the model was trained on.
    pub fn n_ctx_train(&self) -> u32 {
        self.0.n_ctx_train()
    }

    /// Tokenize a prompt.
    pub fn tokenize(&self, prompt: &str) -> Vec<LlamaToken> {
        self.0
            .str_to_token(prompt, AddBos::Never)
            .expect("failed to tokenize prompt")
    }

    /// Get the number of tokens in a prompt.
    pub fn token_count(&self, prompt: &str) -> usize {
        self.tokenize(prompt).len()
    }
}
