use anyhow::{bail, Context, Result};
use std::{io::Write, num::NonZeroU32, pin::pin, time::Duration};

use llama_cpp_2::{
    context::params::LlamaContextParams,
    ggml_time_us,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel, Special},
    token::data_array::LlamaTokenDataArray,
};

pub struct InferOptions {
    pub seed: Option<u32>,
    pub n_ctx: u32,
    pub stop_sequences: Vec<String>,
    pub threads: Option<u32>,
    pub threads_batch: Option<u32>,
    pub temperature: f32,
    pub batch_size: usize,
}

pub fn infer(
    model_path: String,
    prompt: String,
    n_eval: u32,
    options: InferOptions,
) -> Result<String> {
    // init LLM
    let backend = LlamaBackend::init()?;

    let model_params = {
        #[cfg(feature = "cublas")]
        if disable_gpu {
            LlamaModelParams::default()
        } else {
            LlamaModelParams::default().with_n_gpu_layers(1000)
        }

        #[cfg(not(feature = "cublas"))]
        LlamaModelParams::default()
    };

    let mut model_params = pin!(model_params);

    let model = LlamaModel::load_from_file(&backend, model_path, &model_params)?;

    let mut ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(options.n_ctx));

    if let Some(seed) = options.seed {
        ctx_params = ctx_params.with_seed(seed);
    }

    if let Some(threads) = options.threads {
        ctx_params = ctx_params.with_n_threads(threads);
    }

    if let Some(threads_batch) = options.threads_batch.or(options.threads) {
        ctx_params = ctx_params.with_n_threads_batch(threads_batch);
    }

    let mut ctx = model
        .new_context(&backend, ctx_params)
        .with_context(|| "unable to create the llama_context")?;

    let prompt_tokens = model
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

    // print the prompt token-by-token
    eprintln!();
    for token in &prompt_tokens {
        eprint!("{}", model.token_to_str(*token, Special::Tokenize)?);
    }
    std::io::stderr().flush()?;

    let mut batch = LlamaBatch::new(options.batch_size, 1);

    let last_index: i32 = (prompt_tokens.len() - 1) as i32;
    for (i, token) in (0_i32..).zip(prompt_tokens.into_iter()) {
        // llama_decode will output logits only for the last token of the prompt
        let is_last = i == last_index;
        batch.add(token, i, &[0], is_last)?;
    }

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

    'main: while n_cur <= n_len {
        // sample the next token
        {
            let candidates = ctx.candidates_ith(batch.n_tokens() - 1);
            let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);
            ctx.sample_temp(&mut candidates_p, options.temperature);

            let new_token_id = candidates_p.sample_token(&mut ctx);

            // is it an end of stream?
            if new_token_id == model.token_eos() {
                eprintln!();
                break;
            }

            let output_bytes = model.token_to_bytes(new_token_id, Special::Tokenize)?;

            let mut output_string = String::with_capacity(32);
            let _decode_result = decoder.decode_to_string(&output_bytes, &mut output_string, false);

            // Print the output string.
            print!("{}", output_string);
            std::io::stdout().flush()?;

            decoded += &output_string;

            // Is it a stop sequence?
            for stop_sequence in &options.stop_sequences {
                if decoded.ends_with(stop_sequence) {
                    break 'main;
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
