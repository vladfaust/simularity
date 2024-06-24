use anyhow::{Context as AnyHowContext, Ok, Result};
use llama_cpp_2::{ggml_time_us, llama_batch::LlamaBatch, model::AddBos};

use crate::gpt::context::{register_eval_callback, unregister_eval_callback};

use super::{Context, EvalCallback};

impl<'model> Context<'model> {
    /// Decode a prompt, updating the KV cache.
    // TODO: Return the new KV cache size.
    pub fn decode(&mut self, prompt: String, eval_callback: Option<EvalCallback>) -> Result<()> {
        println!(
            "(before) kv cache token_count: {}, used_cells: {}",
            self.context.get_kv_cache_token_count(),
            self.context.get_kv_cache_used_cells()
        );

        let n_session = self.session.len();

        let prompt_tokens = self
            .context
            .model
            .str_to_token(&prompt, AddBos::Always)
            .with_context(|| format!("failed to tokenize {0}", prompt))?;

        let mut batch = LlamaBatch::new(self.context.n_batch().try_into().unwrap(), 1);
        self.cleanup_uncommitted_session();

        let mut will_unregister = false;
        if let Some(eval_callback) = eval_callback {
            let cb_eval_id = self.cb_eval_id.expect("cb_eval_id not set");
            register_eval_callback(cb_eval_id, eval_callback);
            will_unregister = true;
        }

        measure("decode", || {
            if n_session == 0 {
                for i in 0..prompt_tokens.len() {
                    batch.add(
                        *prompt_tokens.get(i).unwrap(),
                        i as i32,
                        &[0],
                        // The latest token will become the head,
                        // that is a token with cached logits.
                        i == prompt_tokens.len() - 1,
                    )?;
                }

                // Decode the batch, caching head logits.
                self.context
                    .decode(&mut batch)
                    .with_context(|| "failed to decode")?;

                self.session = prompt_tokens;
            } else {
                // Add the head.
                batch.add(
                    *self.session.get(n_session - 1).unwrap(),
                    (n_session - 1) as i32,
                    &[0],
                    true, // It must have logits.
                )?;

                // Add the prompt tokens.
                for i in 0..prompt_tokens.len() {
                    batch.add(
                        *prompt_tokens.get(i).unwrap(),
                        (n_session + i) as i32,
                        &[0],
                        // The latest token will become the new head.
                        i == prompt_tokens.len() - 1,
                    )?;
                }

                // Decode the batch, caching the new head logits.
                self.context
                    .decode(&mut batch)
                    .with_context(|| "failed to decode")?;

                self.session.extend(prompt_tokens);
            }

            Ok(())
        })?;

        if will_unregister {
            let cb_eval_id = unsafe { self.cb_eval_id.unwrap_unchecked() };
            unregister_eval_callback(cb_eval_id);
        }

        println!(
            "(after) kv cache token_count: {}, used_cells: {}",
            self.context.get_kv_cache_token_count(),
            self.context.get_kv_cache_used_cells()
        );

        Ok(())
    }
}

fn measure<T, F: FnOnce() -> T>(name: &str, f: F) -> T {
    let start = ggml_time_us();
    let result = f();
    let end = ggml_time_us();
    eprintln!("{}: {:.3} s", name, (end - start) as f32 / 1_000_000.0);
    result
}
