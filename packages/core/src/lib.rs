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

pub fn infer(
    model_path: String,
    n_ctx: Option<u32>,
    n_len: u32,
    seed: Option<u32>,
    prompt: String,
    threads: Option<u32>,
    threads_batch: Option<u32>,
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

    let mut ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(n_ctx.unwrap_or(2048)))
        .with_seed(seed.unwrap_or(0));

    if let Some(threads) = threads {
        ctx_params = ctx_params.with_n_threads(threads);
    }

    if let Some(threads_batch) = threads_batch.or(threads) {
        ctx_params = ctx_params.with_n_threads_batch(threads_batch);
    }

    let mut ctx = model
        .new_context(&backend, ctx_params)
        .with_context(|| "unable to create the llama_context")?;

    let tokens_list = model
        .str_to_token(&prompt, AddBos::Always)
        .with_context(|| format!("failed to tokenize {prompt}"))?;

    let n_cxt = ctx.n_ctx();
    let n_kv_req = tokens_list.len() as u32 + (n_len - tokens_list.len() as u32);

    eprintln!("n_len = {n_len}, n_ctx = {n_cxt}, k_kv_req = {n_kv_req}");

    // make sure the KV cache is big enough to hold all the prompt and generated tokens
    if n_kv_req > n_cxt {
        bail!(
            "n_kv_req > n_ctx, the required kv cache size is not big enough
    either reduce n_len or increase n_ctx"
        )
    }

    if tokens_list.len() >= usize::try_from(n_len)? {
        bail!("the prompt is too long, it has more tokens than n_len")
    }

    // print the prompt token-by-token
    eprintln!();
    for token in &tokens_list {
        eprint!("{}", model.token_to_str(*token, Special::Tokenize)?);
    }
    std::io::stderr().flush()?;

    // create a llama_batch with size 512
    // we use this object to submit token data for decoding
    let mut batch = LlamaBatch::new(512, 1);

    let last_index: i32 = (tokens_list.len() - 1) as i32;
    for (i, token) in (0_i32..).zip(tokens_list.into_iter()) {
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

    while n_cur <= n_len {
        // sample the next token
        {
            let candidates = ctx.candidates_ith(batch.n_tokens() - 1);
            let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);
            ctx.sample_temp(&mut candidates_p, 0.8);

            let new_token_id = candidates_p.sample_token(&mut ctx);

            // is it an end of stream?
            if new_token_id == model.token_eos() {
                eprintln!();
                break;
            }

            let output_bytes = model.token_to_bytes(new_token_id, Special::Tokenize)?;

            // use `Decoder.decode_to_string()` to avoid the intermediate buffer
            let mut output_string = String::with_capacity(32);
            let _decode_result = decoder.decode_to_string(&output_bytes, &mut output_string, false);
            print!("{}", output_string);
            std::io::stdout().flush()?;
            decoded += &output_string;

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
