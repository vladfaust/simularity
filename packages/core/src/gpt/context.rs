use anyhow::{Context as AnyHowContext, Ok, Result};
use llama_cpp_2::context::{params::LlamaContextParams, LlamaContext};
use llama_cpp_2::token::LlamaToken;
use std::collections::HashMap;
use std::num::NonZeroU32;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

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
    cb_eval_id: Option<usize>,
}

unsafe impl Send for Context<'_> {}

type EvalCallback = Box<dyn FnMut() -> bool + Send>;
static EVAL_CALLBACKS: OnceLock<Mutex<HashMap<usize, EvalCallback>>> = OnceLock::new();

// OPTIMIZE: Pass a Rust closure pointer directly to avoid lookup overhead.
// Blocked by https://github.com/utilityai/llama-cpp-rs/issues/363.
extern "C" fn cb_eval_fn(
    _t: *mut llama_cpp_sys_2::ggml_tensor,
    _ask: bool,
    user_data: *mut std::ffi::c_void,
) -> bool {
    let eval_callbacks = EVAL_CALLBACKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut eval_callbacks = eval_callbacks.lock().unwrap();
    let eval_callback = eval_callbacks.get_mut(&(user_data as usize));

    if let Some(eval_callback) = eval_callback {
        eval_callback();
    }

    // See https://github.com/ggerganov/llama.cpp/discussions/8051.
    false
}

pub fn register_eval_callback(id: usize, callback: EvalCallback) -> Option<EvalCallback> {
    let eval_callbacks = EVAL_CALLBACKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut eval_callbacks = eval_callbacks.lock().unwrap();
    eval_callbacks.insert(id, callback)
}

pub fn unregister_eval_callback(id: usize) -> Option<EvalCallback> {
    let eval_callbacks = EVAL_CALLBACKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut eval_callbacks = eval_callbacks.lock().unwrap();
    eval_callbacks.remove(&id)
}

impl<'model> Context<'model> {
    pub fn new(
        backend: &Backend,
        model: &'model Model,
        n_ctx: usize,
        n_batch: usize,
        seed: Option<u32>,
        cb_eval_id: Option<usize>,
    ) -> Result<Self> {
        let mut ctx_params = LlamaContextParams::default();

        ctx_params = ctx_params.with_n_ctx(NonZeroU32::new(n_ctx.try_into().unwrap()));
        ctx_params = ctx_params.with_n_batch(n_batch.try_into().unwrap());
        if let Some(seed) = seed {
            ctx_params = ctx_params.with_seed(seed);
        }

        if let Some(cb_eval_id) = cb_eval_id {
            ctx_params = ctx_params.with_cb_eval(Some(cb_eval_fn));
            ctx_params = ctx_params.with_cb_eval_user_data(cb_eval_id as _);
        }

        let ctx = model
            .0
            .new_context(&backend.0, ctx_params)
            .with_context(|| "unable to create llama context")?;

        Ok(Self {
            context: ctx,
            session: vec![],
            uncommitted_session: vec![],
            cb_eval_id,
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

    /// Save the current context session (i.e. KV cache) to a file.
    pub fn save_session_file(
        &self,
        session_path: impl AsRef<Path>,
        tokens: &[LlamaToken],
    ) -> Result<()> {
        self.context
            .save_session_file(&session_path, tokens)
            .with_context(|| {
                format!(
                    "failed to save session file to {}",
                    session_path.as_ref().display()
                )
            })
    }

    /// Load a session file to fill the KV cache, and set the session tokens.
    /// Should obviously be called right after creating the context.
    pub fn load_session(
        &mut self,
        session_file_path: impl AsRef<Path>,
        tokens: Vec<LlamaToken>,
    ) -> Result<()> {
        self.context
            .load_session_file(&session_file_path, tokens.len())
            .with_context(|| {
                format!(
                    "failed to load session file from {}",
                    session_file_path.as_ref().display()
                )
            })?;

        self.session = tokens;

        Ok(())
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
