use anyhow::{bail, Context, Result};
use std::{io::Write, num::NonZeroU32, str::FromStr, time::Duration};

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

pub struct GptContext<'model>(LlamaContext<'model>);
unsafe impl Send for GptContext<'_> {}

pub fn init_ctx<'model>(
    backend: &GptBackend,
    model: &'model GptModel,
    n_ctx: u32,
    seed: Option<u32>,
) -> Result<GptContext<'model>> {
    let mut ctx_params = LlamaContextParams::default();

    ctx_params = ctx_params.with_n_ctx(NonZeroU32::new(n_ctx));
    ctx_params = ctx_params.with_n_batch(n_ctx);

    if let Some(seed) = seed {
        ctx_params = ctx_params.with_seed(seed);
    }

    Ok(GptContext(
        model
            .0
            .new_context(&backend.0, ctx_params)
            .with_context(|| "unable to create llama context")?,
    ))
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

pub fn infer(
    ctx: &mut GptContext,
    prompt: String,
    n_eval: u32,
    options: InferOptions,
) -> Result<String> {
    let ctx = &mut ctx.0;

    let prompt_tokens = ctx
        .model
        .str_to_token(&prompt, AddBos::Always)
        .with_context(|| format!("failed to tokenize {0}", prompt))?;

    let n_len = prompt_tokens.len() as u32 + n_eval;
    let n_ctx = ctx.n_ctx();

    eprintln!(
        "prompt_len={0}, n_len = {n_len}, n_ctx = {n_ctx}",
        prompt_tokens.len()
    );

    if n_len > n_ctx {
        bail!(
            "n_len > n_ctx, the required kv cache size is not big enough
    either reduce n_len or increase n_ctx"
        )
    }

    let mut grammar = match &options.grammar {
        Some(grammar) => Some(
            LlamaGrammar::from_str(grammar)
                .with_context(|| format!("failed to parse grammar {0}", grammar))?,
        ),
        None => None,
    };

    // print the prompt token-by-token
    eprintln!();
    for token in &prompt_tokens {
        eprint!("{}", ctx.model.token_to_str(*token, Special::Tokenize)?);
    }
    std::io::stderr().flush()?;

    let mut batch = LlamaBatch::new(ctx.n_batch().try_into().unwrap(), 1);

    let last_index: i32 = (prompt_tokens.len() - 1) as i32;
    for (i, token) in (0_i32..).zip(prompt_tokens.into_iter()) {
        // llama_decode will output logits only for the last token of the prompt
        let is_last = i == last_index;
        batch.add(token, i, &[0], is_last)?;
    }

    ctx.clear_kv_cache();
    ctx.decode(&mut batch)
        .with_context(|| "llama_decode() failed")?;

    // main loop

    let mut n_cur = batch.n_tokens() as u32;
    let mut n_decode = 0;

    let t_main_start = ggml_time_us();

    // The `Decoder`
    let mut decoder = encoding_rs::UTF_8.new_decoder();

    // The output string
    let mut decoded = String::new();

    let n_probs = 0; // Number of probabilities to keep - 0 = disabled
    let min_keep = std::cmp::max(1, n_probs);

    let mut mirostat_mu = if let Some(ref mirostat) = &options.mirostat {
        2.0 * mirostat.tau
    } else {
        0.0
    };

    'main: while n_cur <= n_len {
        // sample the next token
        {
            let candidates = ctx.candidates_ith(batch.n_tokens() - 1);
            let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);

            if let Some(grammar) = &grammar {
                ctx.sample_grammar(&mut candidates_p, grammar);
            }

            // See https://github.com/withcatai/node-llama-cpp/blob/29e8c67c01abe4b20afc441ce9cebb25d18eb37e/llama/addon.cpp
            // See https://github.com/ggerganov/llama.cpp/blob/acdce3cdef6fc2f0b7b5623231fd7762c0884d1c/common/sampling.cpp#L199
            let new_token_id = if options.temp.unwrap_or(1.0) < 0.0 {
                ctx.sample_token_softmax(&mut candidates_p);
                candidates_p.data[0].id()
            } else if options.temp.unwrap_or(1.0) == 0.0 {
                ctx.sample_token_greedy(candidates_p)
            } else {
                if let Some(top_k) = options.top_k {
                    ctx.sample_top_k(&mut candidates_p, top_k, min_keep);
                }

                if let Some(tfs_z) = options.tfs_z {
                    ctx.sample_tail_free(&mut candidates_p, tfs_z, min_keep);
                }

                if let Some(typical_p) = options.typical_p {
                    ctx.sample_typical(&mut candidates_p, typical_p, min_keep);
                }

                if let Some(top_p) = options.top_p {
                    ctx.sample_top_p(&mut candidates_p, top_p, min_keep);
                }

                if let Some(min_p) = options.min_p {
                    ctx.sample_min_p(&mut candidates_p, min_p, min_keep);
                }

                if let Some(temp) = options.temp {
                    ctx.sample_temp(&mut candidates_p, temp);
                }

                if let Some(ref mirostat) = options.mirostat {
                    candidates_p.sample_token_mirostat_v2(
                        ctx,
                        mirostat.tau,
                        mirostat.eta,
                        &mut mirostat_mu,
                    );
                }

                candidates_p.sample_token(ctx)
            };

            // is it an end of stream?
            if new_token_id == ctx.model.token_eos() {
                eprintln!();
                break;
            }

            if let Some(grammar) = &mut grammar {
                ctx.grammar_accept_token(grammar, new_token_id);
            }

            let output_bytes = ctx.model.token_to_bytes(new_token_id, Special::Tokenize)?;
            let mut output_string = String::with_capacity(32);
            let _decode_result = decoder.decode_to_string(&output_bytes, &mut output_string, false);

            // Print the output string.
            print!("{}", output_string);
            std::io::stdout().flush()?;

            decoded += &output_string;

            // Is it a stop sequence?
            if let Some(stop_sequences) = &options.stop_sequences {
                for stop_sequence in stop_sequences {
                    if decoded.ends_with(stop_sequence) {
                        break 'main;
                    }
                }
            }

            batch.clear();
            batch.add(new_token_id, n_cur as i32, &[0], true)?;
        }

        n_cur += 1;
        ctx.decode(&mut batch).with_context(|| "failed to eval")?;
        n_decode += 1;
    }

    eprintln!("\n");

    let t_main_end = ggml_time_us();
    let duration = Duration::from_micros((t_main_end - t_main_start) as u64);

    eprintln!(
        "decoded {} tokens in {:.2} s, speed {:.2} t/s\n",
        n_decode,
        duration.as_secs_f32(),
        n_decode as f32 / duration.as_secs_f32()
    );

    println!("{}", ctx.timings());

    Ok(decoded)
}
