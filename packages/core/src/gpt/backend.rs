use anyhow::{Context, Ok, Result};
use llama_cpp_2::llama_backend::LlamaBackend;

pub struct Backend(pub LlamaBackend);

impl Backend {
    pub fn new() -> Result<Self> {
        Ok(Backend(
            LlamaBackend::init().with_context(|| "unable to create the llama backend")?,
        ))
    }
}
