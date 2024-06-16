use anyhow::{Context as AnyHowContext, Ok, Result};
use llama_cpp_2::context::{params::LlamaContextParams, LlamaContext};
use llama_cpp_2::token::LlamaToken;
use std::num::NonZeroU32;

use super::backend::Backend;
use super::model::Model;

pub mod decode;
pub mod infer;

/// A GPT context holds KV cache, thus requiring contiguity in prompts.
/// Call `clear` to reset the context completely.
pub struct Context<'model> {
    context: LlamaContext<'model>,
    session: Vec<LlamaToken>,
    uncommitted_session: Vec<LlamaToken>,
}

unsafe impl Send for Context<'_> {}

impl<'model> Context<'model> {
    pub fn new(
        backend: &Backend,
        model: &'model Model,
        n_ctx: u32,
        n_batch: usize,
        seed: Option<u32>,
    ) -> Result<Self> {
        let mut ctx_params = LlamaContextParams::default();

        ctx_params = ctx_params.with_n_ctx(NonZeroU32::new(n_ctx));
        ctx_params = ctx_params.with_n_batch(n_batch.try_into().unwrap());
        if let Some(seed) = seed {
            ctx_params = ctx_params.with_seed(seed);
        }

        let ctx = model
            .0
            .new_context(&backend.0, ctx_params)
            .with_context(|| "unable to create llama context")?;

        Ok(Self {
            context: ctx,
            session: vec![],
            uncommitted_session: vec![],
        })
    }

    pub fn reset(&mut self) -> Result<()> {
        self.context.clear_kv_cache();
        self.session.clear();
        self.uncommitted_session.clear();
        Ok(())
    }

    /// Commit the latest inferred tokens (along with
    /// their infer prompt, if any) to the session.
    /// Returns the number of tokens committed.
    pub fn commit(&mut self) -> Result<usize> {
        let len = self.uncommitted_session.len();
        self.session.append(&mut self.uncommitted_session);
        Ok(len)
    }

    /// Get the number of tokens in the KV cache.
    pub fn kv_cache_size(&self) -> usize {
        self.context.get_kv_cache_token_count() as usize
    }

    /// Clears the uncommitted session and its KV cache, if any.
    fn cleanup_uncommitted_session(&mut self) {
        if !self.uncommitted_session.is_empty() {
            self.context.clear_kv_cache_seq(
                0,
                Some(self.session.len() as u16),
                Some((self.session.len() + self.uncommitted_session.len()) as u16),
            );

            self.uncommitted_session.clear();
        }
    }
}
