#include <chrono>
#include <spdlog/spdlog.h>

#include "../../llama/grammar-parser.cpp"
#include "../../llama/sampling.cpp"
#include "common.cpp"

class LlamaSamplingContext {
public:
  llama_sampling_context *context;
  LlamaSamplingContext(llama_sampling_context *context) : context(context) {}
  ~LlamaSamplingContext() { llama_sampling_free(context); }
  void reset() { llama_sampling_reset(context); }
  llama_token sample(llama_context *llama_ctx, const int idx = -1) {
    return llama_sampling_sample(context, llama_ctx, NULL, idx);
  }
  void accept(llama_context *llama_ctx, llama_token token) {
    llama_sampling_accept(context, llama_ctx, token, true);
  }
};

int simularity_gpt_infer(
    unsigned session_id,
    const char *prompt,
    unsigned n_eval,
    const struct simularity_gpt_inference_options options,
    void(decode_progress_callback)(float, void *),
    void *decode_progress_callback_user_data,
    bool(inference_callback)(const char *output, void *),
    void *inference_callback_user_data
) {
  // Acquire the session.
  auto locking_result = try_locking_session(session_id);
  if (!locking_result.has_value()) return -1; // Session not found.
  auto [_, session] = std::move(locking_result.value());
  spdlog::info("Inferencing for session {}", session_id);

  struct llama_sampling_params sampling_params = {
      .n_prev            = options.n_prev,
      .n_probs           = options.n_probs,
      .min_keep          = options.min_keep,
      .top_k             = options.top_k,
      .top_p             = options.top_p,
      .min_p             = options.min_p,
      .tfs_z             = options.tfs_z,
      .typical_p         = options.typical_p,
      .temp              = options.temp,
      .dynatemp_range    = options.dynatemp_range,
      .dynatemp_exponent = options.dynatemp_exponent,
      .penalty_last_n    = options.penalty_last_n,
      .penalty_repeat    = options.penalty_repeat,
      .penalty_freq      = options.penalty_freq,
      .penalty_present   = options.penalty_present,
      .mirostat          = options.mirostat,
      .mirostat_tau      = options.mirostat_tau,
      .mirostat_eta      = options.mirostat_eta,
      .penalize_nl       = options.penalize_nl,
      .seed              = options.seed,
      .grammar           = std::string(options.grammar),
  };

  auto sampling_ctx =
      new LlamaSamplingContext(llama_sampling_init(sampling_params));
  spdlog::debug("Sampling context initialized");

  std::vector<std::string> stop_sequences;
  spdlog::debug("Adding stop sequences");
  for (unsigned i = 0; i < options.stop_sequences_len; i++) {
    spdlog::debug("Adding stop sequence: {}", options.stop_sequences[i]);
    stop_sequences.push_back(std::string(options.stop_sequences[i]));
  }

  spdlog::debug("Before llama_tokenize (c++)");
  auto prompt_tokens =
      prompt == NULL ? std::vector<llama_token>()
                     : llama_tokenize(session->model(), prompt, true, true);
  spdlog::debug("Prompt tokenized");

  auto n_committed = session->committed_prompt.size();
  auto n_prompt    = prompt_tokens.size();
  auto n_target    = n_committed + n_prompt + n_eval;

  struct llama_batch batch = llama_batch_init(n_target, 0, 1);
  spdlog::debug("Batch initialized");

  if (n_committed) {
    spdlog::debug("Adding committed prompt to the batch");

    llama_batch_add(
        batch,
        session->committed_prompt[n_committed - 1],
        n_committed - 1,
        {0},

        // The latest session token must have logits.
        true
    );
  }

  if (n_prompt) {
    spdlog::debug("Adding prompt to the batch");

    for (unsigned i = 0; i < n_prompt; i++) {
      llama_batch_add(
          batch,
          prompt_tokens[i],
          n_committed + i,
          {0},

          // The latest token will become the new (temporary) head.
          i == n_prompt - 1
      );
    }
  }

  session->clear_uncommitted_kv_cache();
  session->uncommitted_prompt = prompt_tokens;
  spdlog::debug("Uncommitted prompt cleared");

  int err = decode_with_progress(
      session,
      batch,
      (n_committed + n_prompt) * 2,
      decode_progress_callback,
      decode_progress_callback_user_data
  );
  if (err == 1) return -2; // Could not find a KV slot for the batch.
  else if (err) return err;

  std::string result = "";
  unsigned n_decoded = 0;
  auto start         = std::chrono::high_resolution_clock::now();

  while (n_decoded < n_eval) {
    llama_token next = sampling_ctx->sample(session->context);

    if (next == llama_token_eos(session->model())) {
      spdlog::info("EOS token found, stopping inference");
      break;
    }

    // Accept the token and add it to the uncommitted prompt.
    sampling_ctx->accept(session->context, next);
    session->uncommitted_prompt.push_back(next);

    // Convert the token to a piece and add it to the result.
    auto piece = llama_token_to_piece(session->model(), next, false);
    result += piece;

    // Check if `result` ends with any of the stop sequences.
    for (auto &stop_sequence : stop_sequences) {
      if (result.size() >= stop_sequence.size() &&
          result.compare(
              result.size() - stop_sequence.size(),
              stop_sequence.size(),
              stop_sequence
          ) == 0) {
        spdlog::info("Stop sequence found, stopping inference");
        break;
      }
    }

    // Call the inference callback.
    if (inference_callback != NULL) {
      if (!inference_callback(piece.c_str(), inference_callback_user_data)) {
        spdlog::info("Inference callback returned false, stopping inference");
        break;
      }
    }

    // Clear the batch and add the single next token to it.
    batch.n_tokens = 0;
    llama_batch_add(batch, next, n_committed + n_decoded, {0}, true);

    // Decode the next token.
    // OPTIMIZE: Try removing it?
    auto err = llama_decode(session->context, batch);
    if (err == -1) return -2;
    else if (err) return err;

    n_decoded++;
  }

  auto end = std::chrono::high_resolution_clock::now();
  spdlog::info(
      "Inferenced {} tokens in {}ms ({} tok/s)",
      n_decoded,
      std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
          .count(),
      (float)n_decoded /
          std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
  );

  return n_decoded;
}
