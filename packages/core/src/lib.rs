use anyhow::{Context, Ok, Result};
use llama_cpp_2::token::LlamaToken;
use std::{num::NonZeroU32, str::FromStr};

use llama_cpp_2::{
    context::{params::LlamaContextParams, LlamaContext},
    ggml_time_us,
    grammar::LlamaGrammar,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel, Special},
    token::data_array::LlamaTokenDataArray,
};

pub struct GptBackend(LlamaBackend);

pub fn init_backend() -> Result<GptBackend> {
    Ok(GptBackend(
        LlamaBackend::init().with_context(|| "unable to create the llama backend")?,
    ))
}

pub struct GptModel(LlamaModel);

pub fn init_model(backend: &GptBackend, model_path: &str) -> Result<GptModel> {
    let model_params = LlamaModelParams::default();

    Ok(GptModel(
        LlamaModel::load_from_file(&backend.0, model_path, &model_params)
            .with_context(|| format!("unable to load model from {0}", model_path))?,
    ))
}

/// A GPT context holds KV cache, thus requiring contiguity in prompts.
/// Call `clear` to reset the context completely.
pub struct GptContext<'model> {
    context: LlamaContext<'model>,
    session: Vec<LlamaToken>,
}

unsafe impl Send for GptContext<'_> {}

impl<'model> GptContext<'model> {
    pub fn new(
        backend: &GptBackend,
        model: &'model GptModel,
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
        })
    }
}

pub fn clear(ctx: &mut GptContext) -> Result<()> {
    ctx.context.clear_kv_cache();
    ctx.session.clear();
    Ok(())
}

/// Decodes a prompt.
pub fn decode(ctx: &mut GptContext, prompt: String) -> Result<()> {
    println!(
        "(before) kv cache token_count: {}, used_cells: {}",
        ctx.context.get_kv_cache_token_count(),
        ctx.context.get_kv_cache_used_cells()
    );

    let n_session = ctx.session.len();

    let prompt_tokens = ctx
        .context
        .model
        .str_to_token(&prompt, AddBos::Always)
        .with_context(|| format!("failed to tokenize {0}", prompt))?;

    let mut batch = LlamaBatch::new(ctx.context.n_batch().try_into().unwrap(), 1);

    measure("decode", || {
        if n_session == 0 {
            for i in 0..prompt_tokens.len() {
                batch.add(
                    *prompt_tokens.get(i).unwrap(),
                    i as i32,
                    &[0],
                    // The last token will become the new logit-ed token.
                    i == prompt_tokens.len() - 1,
                )?;
            }

            ctx.context
                .decode(&mut batch)
                .with_context(|| "failed to decode")?;

            ctx.session = prompt_tokens;
        } else {
            // Add the latest logit-ed session token.
            batch.add(
                *ctx.session.get(n_session - 1).unwrap(),
                (n_session - 1) as i32,
                &[0],
                true, // It has logits.
            )?;

            // Add the prompt tokens.
            for i in 0..prompt_tokens.len() {
                batch.add(
                    *prompt_tokens.get(i).unwrap(),
                    (n_session + i) as i32,
                    &[0],
                    // The last token will become the new logit-ed token.
                    i == prompt_tokens.len() - 1,
                )?;
            }

            ctx.context
                .decode(&mut batch)
                .with_context(|| "failed to decode")?;

            ctx.session.extend(prompt_tokens);
        }

        Ok(())
    })?;

    println!(
        "(after) kv cache token_count: {}, used_cells: {}",
        ctx.context.get_kv_cache_token_count(),
        ctx.context.get_kv_cache_used_cells()
    );

    Ok(())
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MirostatV2 {
    pub tau: f32,
    pub eta: f32,
}

#[derive(serde::Deserialize, Debug)]
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

/// Infer the next tokens.
/// TODO: Also accept optional prompt to decode in-place.
pub fn infer(ctx: &mut GptContext, n_eval: usize, options: InferOptions) -> Result<String> {
    let mut grammar = match &options.grammar {
        Some(grammar) => Some(
            measure("grammar parsing", || LlamaGrammar::from_str(grammar))
                .with_context(|| format!("failed to parse grammar {0}", grammar))?,
        ),
        None => None,
    };

    let mut n_session = ctx.session.len();
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

    // Create a batch containing the latest logit-ed session token.
    let mut batch = LlamaBatch::new(ctx.context.n_batch().try_into().unwrap(), 1);
    batch.add(
        *ctx.session.get(n_session - 1).unwrap(),
        (n_session - 1) as i32,
        &[0],
        true, // It has logits.
    )?;
    ctx.context
        .decode(&mut batch)
        .with_context(|| "failed to decode")?;

    let start = ggml_time_us();
    'main: while n_session <= n_target {
        {
            let candidates = ctx.context.candidates_ith(batch.n_tokens() - 1);
            let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);

            if let Some(grammar) = &grammar {
                ctx.context.sample_grammar(&mut candidates_p, grammar);
            }

            // See https://github.com/withcatai/node-llama-cpp/blob/29e8c67c01abe4b20afc441ce9cebb25d18eb37e/llama/addon.cpp
            // See https://github.com/ggerganov/llama.cpp/blob/acdce3cdef6fc2f0b7b5623231fd7762c0884d1c/common/sampling.cpp#L199
            let new_token = if options.temp.unwrap_or(1.0) < 0.0 {
                ctx.context.sample_token_softmax(&mut candidates_p);
                candidates_p.data[0].id()
            } else if options.temp.unwrap_or(1.0) == 0.0 {
                ctx.context.sample_token_greedy(candidates_p)
            } else {
                if let Some(top_k) = options.top_k {
                    ctx.context.sample_top_k(&mut candidates_p, top_k, min_keep);
                }

                if let Some(tfs_z) = options.tfs_z {
                    ctx.context
                        .sample_tail_free(&mut candidates_p, tfs_z, min_keep);
                }

                if let Some(typical_p) = options.typical_p {
                    ctx.context
                        .sample_typical(&mut candidates_p, typical_p, min_keep);
                }

                if let Some(top_p) = options.top_p {
                    ctx.context.sample_top_p(&mut candidates_p, top_p, min_keep);
                }

                if let Some(min_p) = options.min_p {
                    ctx.context.sample_min_p(&mut candidates_p, min_p, min_keep);
                }

                if let Some(temp) = options.temp {
                    ctx.context.sample_temp(&mut candidates_p, temp);
                }

                if let Some(ref mirostat) = options.mirostat {
                    candidates_p.sample_token_mirostat_v2(
                        &mut ctx.context,
                        mirostat.tau,
                        mirostat.eta,
                        &mut mirostat_mu,
                    );
                }

                candidates_p.sample_token(&mut ctx.context)
            };

            // is it an end of stream?
            if new_token == ctx.context.model.token_eos() {
                break;
            }

            if let Some(grammar) = &mut grammar {
                ctx.context.grammar_accept_token(grammar, new_token);
            }

            let output_bytes = ctx
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

                        break 'main;
                    }
                }
            }

            // Set the batch to contain only the new token.
            batch.clear();
            batch.add(new_token, n_session as i32, &[0], true)?;
        }

        n_session += 1;

        // Decode the new token.
        ctx.context
            .decode(&mut batch)
            .with_context(|| "failed to decode")?;

        n_decoded += 1;
    }
    let end = ggml_time_us();
    let duration = (end - start) as f32 / 1_000_000.0;
    eprintln!(
        "predicted {} tokens in {:.2} s, speed {:.2} t/s\n",
        n_decoded,
        duration,
        n_decoded as f32 / duration
    );

    Ok(decoded_string)
}

fn measure<T, F: FnOnce() -> T>(name: &str, f: F) -> T {
    let start = ggml_time_us();
    let result = f();
    let end = ggml_time_us();
    eprintln!("{}: {:.3} s", name, (end - start) as f32 / 1_000_000.0);
    result
}
