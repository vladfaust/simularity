use anyhow::{Context as AnyHowContext, Ok, Result};
use llama_cpp_2::{
    ggml_time_us,
    grammar::LlamaGrammar,
    llama_batch::LlamaBatch,
    model::{AddBos, Special},
    token::data_array::LlamaTokenDataArray,
};
use std::str::FromStr;

use super::{Context, EvalCallback};
use crate::gpt::context::{register_eval_callback, unregister_eval_callback};

#[derive(serde::Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct MirostatV2 {
    pub tau: f32,
    pub eta: f32,
}

#[derive(serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InferOptions {
    pub stop_sequences: Option<Vec<String>>,
    pub grammar: Option<String>,
    pub temp: Option<f32>,
    pub top_k: Option<i32>,
    pub min_p: Option<f32>,
    pub top_p: Option<f32>,
    pub tfs_z: Option<f32>,
    pub typical_p: Option<f32>,
    pub mirostat: Option<MirostatV2>,
}

impl<'model> Context<'model> {
    /// Predict the next tokens.
    /// May pass a `prompt` argument to save a `decode` call.
    ///
    /// NOTE: Neither the `prompt` nor the inferred tokens are committed to the session.
    /// Call `commit` after `infer` to apply both the prompt and the inferred tokens.
    /// This allows to `infer` multiple times from the same point.
    ///
    /// # Arguments
    ///
    /// * `decode_callback` - A callback to be called after a token
    ///   is decoded during the pre-inference phase.
    ///
    pub fn infer(
        &mut self,
        prompt: Option<&str>,
        n_eval: usize,
        options: InferOptions,
        decode_callback: Option<EvalCallback>,
        infer_callback: Option<impl Fn(&str)>,
    ) -> Result<String> {
        let mut grammar = match &options.grammar {
            Some(grammar) => Some(
                measure("grammar parsing", || LlamaGrammar::from_str(grammar))
                    .with_context(|| format!("failed to parse grammar {0}", grammar))?,
            ),
            None => None,
        };

        let mut n_session = self.session.len();
        let n_target = n_session + n_eval;
        let mut n_decoded = 0;

        let mut string_decoder = encoding_rs::UTF_8.new_decoder();
        let mut decoded_string = String::with_capacity(32);

        let n_probs = 0; // Number of probabilities to keep - 0 = disabled
        let min_keep = std::cmp::max(1, n_probs);
        let mut mirostat_mu = if let Some(ref mirostat) = &options.mirostat {
            2.0 * mirostat.tau
        } else {
            0.0
        };

        let mut batch = LlamaBatch::new(self.context.n_batch().try_into().unwrap(), 1);
        self.cleanup_uncommitted_session();

        // Add the head.
        if n_session > 0 {
            batch.add(
                *self.session.get(n_session - 1).unwrap(),
                (n_session - 1) as i32,
                &[0],
                true, // It must have logits.
            )?;

            let token_str = self
                .context
                .model
                .token_to_str(
                    *self.session.get(n_session - 1).unwrap(),
                    Special::Plaintext,
                )
                .unwrap();

            eprint!("Session head token: {} (", token_str);
            for c in token_str.chars() {
                eprint!("{}", c.escape_unicode());
            }
            eprintln!(").");
        }

        if let Some(prompt) = prompt {
            let prompt_tokens = self
                .context
                .model
                .str_to_token(prompt, AddBos::Never)
                .with_context(|| format!("failed to tokenize {0}", prompt))?;

            // Add the prompt tokens.
            for i in 0..prompt_tokens.len() {
                batch.add(
                    *prompt_tokens.get(i).unwrap(),
                    (n_session + i) as i32,
                    &[0],
                    // The latest token will become the new (temporary) head.
                    i == prompt_tokens.len() - 1,
                )?;
            }

            let token_str = self
                .context
                .model
                .token_to_str(*prompt_tokens.last().unwrap(), Special::Plaintext)
                .unwrap();

            eprint!("Prompt head token: {} (", token_str);
            for c in token_str.chars() {
                eprint!("{}", c.escape_unicode());
            }
            eprintln!(").");

            self.uncommitted_session = prompt_tokens;
        } else {
            self.uncommitted_session.clear();
        }

        // If the prompt is not provided, the head logits is cached.
        // Otherwise, the decoding will take some time
        // to calculate, cache & initialize the new head logits.
        //

        let mut will_unregister = false;
        if let Some(decode_callback) = decode_callback {
            let cb_eval_id = self.cb_eval_id.expect("cb_eval_id not set");
            register_eval_callback(cb_eval_id, decode_callback);
            will_unregister = true;
        }

        measure("infer:decoding", || {
            self.context
                .decode(&mut batch)
                .with_context(|| "failed to decode")
        })?;

        if will_unregister {
            let cb_eval_id = unsafe { self.cb_eval_id.unwrap_unchecked() };
            unregister_eval_callback(cb_eval_id);
        }

        let start = ggml_time_us();
        'main: while n_session <= n_target {
            {
                // Get the batch head logits.
                let candidates = self.context.candidates_ith(batch.n_tokens() - 1);
                let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);

                if let Some(grammar) = &grammar {
                    self.context.sample_grammar(&mut candidates_p, grammar);
                }

                // See https://github.com/withcatai/node-llama-cpp/blob/29e8c67c01abe4b20afc441ce9cebb25d18eb37e/llama/addon.cpp
                // See https://github.com/ggerganov/llama.cpp/blob/acdce3cdef6fc2f0b7b5623231fd7762c0884d1c/common/sampling.cpp#L199
                let new_token = if options.temp.unwrap_or(1.0) < 0.0 {
                    self.context.sample_token_softmax(&mut candidates_p);
                    candidates_p.data[0].id()
                } else if options.temp.unwrap_or(1.0) == 0.0 {
                    self.context.sample_token_greedy(candidates_p)
                } else {
                    if let Some(top_k) = options.top_k {
                        self.context
                            .sample_top_k(&mut candidates_p, top_k, min_keep);
                    }

                    if let Some(tfs_z) = options.tfs_z {
                        self.context
                            .sample_tail_free(&mut candidates_p, tfs_z, min_keep);
                    }

                    if let Some(typical_p) = options.typical_p {
                        self.context
                            .sample_typical(&mut candidates_p, typical_p, min_keep);
                    }

                    if let Some(top_p) = options.top_p {
                        self.context
                            .sample_top_p(&mut candidates_p, top_p, min_keep);
                    }

                    if let Some(min_p) = options.min_p {
                        self.context
                            .sample_min_p(&mut candidates_p, min_p, min_keep);
                    }

                    if let Some(temp) = options.temp {
                        self.context.sample_temp(&mut candidates_p, temp);
                    }

                    if let Some(ref mirostat) = options.mirostat {
                        candidates_p.sample_token_mirostat_v2(
                            &mut self.context,
                            mirostat.tau,
                            mirostat.eta,
                            &mut mirostat_mu,
                        );
                    }

                    candidates_p.sample_token(&mut self.context)
                };

                // is it an end of stream?
                if new_token == self.context.model.token_eos() {
                    eprintln!("Stopping at EOS token");
                    break;
                }

                if let Some(grammar) = &mut grammar {
                    self.context.grammar_accept_token(grammar, new_token);
                }

                let output_bytes = self
                    .context
                    .model
                    .token_to_bytes(new_token, Special::Tokenize)?;

                let mut output_string = String::with_capacity(32);
                let _ = string_decoder.decode_to_string(&output_bytes, &mut output_string, false);
                print!("{}", output_string);
                decoded_string += &output_string;

                // Is it a stop sequence?
                if let Some(stop_sequences) = &options.stop_sequences {
                    for stop_sequence in stop_sequences {
                        if decoded_string.ends_with(stop_sequence) {
                            // Remove the stop sequence.
                            decoded_string.truncate(decoded_string.len() - stop_sequence.len());

                            // "Stopping at sequence \u{a}." (newline).
                            eprint!("Stopping at sequence ",);
                            for c in stop_sequence.chars() {
                                eprint!("{}", c.escape_unicode());
                            }
                            eprintln!(".");

                            break 'main;
                        }
                    }
                }

                // TODO: Put it to the end of block, stop if it returns false.
                if let Some(f) = &infer_callback {
                    f(&output_string)
                }

                // Set the batch head to the new token.
                batch.clear();
                batch.add(new_token, n_session as i32, &[0], true)?;

                // NOTE: The stop sequence is NOT added to the uncommitted session.
                self.uncommitted_session.push(new_token);
            }

            n_session += 1;

            // Decode the new token, caching & initializing its logits.
            self.context
                .decode(&mut batch)
                .with_context(|| "failed to decode")?;

            n_decoded += 1;
        }
        let end = ggml_time_us();
        let duration = (end - start) as f32 / 1_000_000.0;
        eprintln!(
            "predicted {} tokens in {:.2} s, speed {:.2} t/s",
            n_decoded,
            duration,
            n_decoded as f32 / duration
        );
        eprintln!(
            "new kv_cache_token_count: {}",
            self.context.get_kv_cache_token_count()
        );

        Ok(decoded_string)
    }
}

fn measure<T, F: FnOnce() -> T>(name: &str, f: F) -> T {
    let start = ggml_time_us();
    let result = f();
    let end = ggml_time_us();
    eprintln!("{}: {:.3} s", name, (end - start) as f32 / 1_000_000.0);
    result
}
