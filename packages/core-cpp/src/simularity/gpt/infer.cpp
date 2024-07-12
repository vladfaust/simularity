#include <chrono>
#include <iostream>
#include <spdlog/fmt/bin_to_hex.h>
#include <spdlog/fmt/ranges.h>
#include <spdlog/spdlog.h>
#include <sstream>
#include <string>

#include "../../llama/grammar-parser.cpp"
#include "../../llama/sampling.cpp"
#include "common.cpp"
#include "llama.h"

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
      .seed              = options.seed};

  if (options.grammar != nullptr) {
    sampling_params.grammar = std::string(options.grammar);
  }

  struct llama_sampling_context *raw_sampling_ctx;
  try {
    raw_sampling_ctx = llama_sampling_init(sampling_params);
    if (raw_sampling_ctx == nullptr) {
      return -3; // Failed to initialize the sampling context.
    }
  } catch (std::exception &e) {
    spdlog::error("Error at llama_sampling_init: {}", e.what());
    return -5;
  }
  auto sampling_ctx = new LlamaSamplingContext(raw_sampling_ctx);
  spdlog::debug("Sampling context initialized");

  std::vector<std::vector<llama_token>> stop_sequences;
  spdlog::debug("Adding stop sequences");
  for (unsigned i = 0; i < options.stop_sequences_len; i++) {
    auto string = std::string(options.stop_sequences[i]);
    auto tokens = llama_tokenize(
        session->model(), options.stop_sequences[i], false, false
    );

    // FIXME: For some reason, "\n" results in [28705, 13].
    tokens.erase(tokens.begin());

    spdlog::debug(
        "Stop sequence: `{:np}` ({}) ({})",
        spdlog::to_hex(string),
        options.stop_sequences[i],
        tokens
    );

    stop_sequences.push_back(tokens);
  }

  spdlog::debug("Tokenizing prompt");
  auto prompt_tokens =
      prompt == NULL ? std::vector<llama_token>()
                     : llama_tokenize(session->model(), prompt, false, true);

  auto n_committed = session->committed_prompt.size();
  auto n_prompt    = prompt_tokens.size();
  auto n_target    = n_committed + n_prompt + n_eval;

  spdlog::debug(
      "n_committed: {}, n_prompt: {}, n_eval: {}, n_target: {}",
      n_committed,
      n_prompt,
      n_eval,
      n_target
  );

  auto batch = new Batch(n_target, 0, 1);
  spdlog::debug("Batch initialized");

  if (n_committed) {
    spdlog::debug("Adding the latest committed prompt token to the batch");

    batch->add(
        session->committed_prompt[n_committed - 1],
        n_committed - 1,
        {0},

        // The latest session token must have logits.
        true
    );
  }

  if (n_prompt) {
    spdlog::debug("Adding {} prompt tokens to the batch", n_prompt);

    for (unsigned i = 0; i < n_prompt; i++) {
      batch->add(
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
      batch->batch,
      (n_committed + n_prompt) * 2,
      decode_progress_callback,
      decode_progress_callback_user_data
  );
  if (err == 1) return -2; // Could not find a KV slot (context overflow).
  else if (err) {
    spdlog::warn("Failed to decode -> {}", err);
    return -4; // Decoding error.
  }

  std::vector<llama_token> decoded_tokens;
  auto start = std::chrono::high_resolution_clock::now();

  while (decoded_tokens.size() < n_eval) {
    llama_token next;

    try {
      next = sampling_ctx->sample(session->context);
    } catch (std::exception &e) {
      spdlog::error("Error at sample: {}", e.what());
      return -7;
    }

    auto piece = llama_token_to_piece(session->model(), next, true);

    if (next == llama_token_eos(session->model())) {
      spdlog::info("EOS token found, stopping inference");
      break;
    }

    // Accept the token and add it to the decoded tokens.
    sampling_ctx->accept(session->context, next);
    decoded_tokens.push_back(next);

    // Call the inference callback.
    if (inference_callback != NULL) {
      if (!inference_callback(piece.c_str(), inference_callback_user_data)) {
        spdlog::info("Inference callback returned false, stopping inference");
        break;
      }
    }

    bool found = false;
    for (auto &stop_sequence : stop_sequences) {
      // Check if
      if (decoded_tokens.size() < stop_sequence.size() ||
          !std::equal(
              decoded_tokens.end() - stop_sequence.size(),
              decoded_tokens.end(),
              stop_sequence.begin()
          )) {
        continue;
      }

      spdlog::info(
          "Stop sequence found ({}), stopping inference", stop_sequence
      );

      spdlog::debug(
          "Removing {} token(s) from the uncommitted prompt",
          stop_sequence.size()
      );

      for (unsigned i = 0; i < stop_sequence.size() - 1; i++) {
        session->uncommitted_prompt.pop_back();
      }

      if (stop_sequence.size() > 1) {
        auto p0 = n_committed + n_prompt + decoded_tokens.size() -
                  stop_sequence.size() + 1;
        spdlog::debug("Clearing KV cache at [{}; {})]", p0, -1);
        llama_kv_cache_seq_rm(session->context, 0, p0, -1);
      }

      found = true;
      break;
    }

    if (found) break;

    // Clear the batch and add the single next token to it.
    batch->batch.n_tokens = 0;
    batch->add(next, n_committed + decoded_tokens.size(), {0}, true);
    session->uncommitted_prompt.push_back(next);

    // Decode the next token.
    auto err = llama_decode(session->context, batch->batch);
    if (err == -1) return -2; // Could not find a KV slot (context overflow).
    else if (err) {
      spdlog::warn("Failed to decode -> {}", err);
      return -6; // Decoding error.
    }
  }

  auto end = std::chrono::high_resolution_clock::now();
  spdlog::info(
      "Inferenced {} tokens in {:.3f}s ({:.2f} tok/s)",
      decoded_tokens.size(),
      (float)std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
              .count() /
          1000,
      (float)decoded_tokens.size() /
          std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
  );

  return decoded_tokens.size();
}
