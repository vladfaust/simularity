#include <chrono>
#include <iostream>
#include <optional>
#include <spdlog/fmt/bin_to_hex.h>
#include <spdlog/fmt/ranges.h>
#include <spdlog/spdlog.h>
#include <sstream>
#include <string>

#include "../../llama/grammar-parser.cpp"
#include "../../llama/sampling.cpp"
#include "common.cpp"
#include "decode.cpp"
#include "llama.h"
#include "sol/sol.hpp"
#include "sol/types.hpp"

// Defined in lua-cjson.c
extern "C" int luaopen_cjson(lua_State *l);

simularity_gpt_inference_options simularity_gpt_inference_options_default() {
  return simularity_gpt_inference_options{
      .n_prev             = 64,
      .n_probs            = 0,
      .min_keep           = 0,
      .top_k              = 40,
      .top_p              = 0.95f,
      .min_p              = 0.05f,
      .tfs_z              = 1.00f,
      .typical_p          = 1.00f,
      .temp               = 0.80f,
      .dynatemp_range     = 0.00f,
      .dynatemp_exponent  = 1.00f,
      .penalty_last_n     = 64,
      .penalty_repeat     = 1.00f,
      .penalty_freq       = 0.00f,
      .penalty_present    = 0.00f,
      .mirostat           = 0,
      .mirostat_tau       = 5.00f,
      .mirostat_eta       = 0.10f,
      .penalize_nl        = false,
      .seed               = 0,
      .grammar            = nullptr,
      .stop_sequences_len = 0,
      .stop_sequences     = nullptr,
      .lua_grammar        = nullptr,
  };
}

int simularity_gpt_infer(
    unsigned session_id,
    const char *prompt,
    unsigned n_eval,
    const struct simularity_gpt_inference_options options,
    llama_progress_callback decode_progress_callback,
    void *decode_progress_callback_user_data,
    bool(inference_callback)(const char *output, void *),
    void *inference_callback_user_data
) {
  // Acquire the session.
  auto locking_result = try_locking_session(session_id);
  if (!locking_result.has_value()) return -1; // Session not found.
  auto [_, session] = std::move(locking_result.value());
  spdlog::info("Inferencing for session {}", session_id);

  // Prepare sampling params.
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

  std::optional<sol::state> lua_state;
  std::optional<sol::function> lua_on_eos_function;

  // Set grammar, if provided.
  if (options.grammar != nullptr) {
    if (options.lua_grammar != nullptr) {
      spdlog::error("Both grammar and lua_grammar are provided, that's a error"
      );

      return -3;
    }

    sampling_params.grammar = std::string(options.grammar);
  } else if (options.lua_grammar != nullptr) {
    spdlog::debug("Initializing Lua state");
    sol::state lua;

    // Make `cjson` table available in the Lua state.
    luaopen_cjson(lua.lua_state());

    spdlog::info("Running Lua grammar script");
    spdlog::debug(options.lua_grammar);

    // Add the cjson library.
    lua.open_libraries(sol::lib::base, sol::lib::string, sol::lib::table);

    try {
      lua.safe_script(options.lua_grammar);
    } catch (const sol::error &e) {
      spdlog::error("Error during initial Lua script loading: {}", e.what());
      return -8;
    }

    sol::function lua_start_function = lua["start"];

    try {
      sampling_params.grammar = lua_start_function();
    } catch (const sol::error &e) {
      spdlog::error("Error during Lua .start() call: {}", e.what());
      return -8;
    }

    // ADHOC: Need to extract to a variable in MSVC.
    sol::function f     = lua["on_eos"];
    lua_on_eos_function = f;

    lua_state = std::move(lua);
  }

  // Create the sampling context.
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

  // Add stop sequences.
  std::vector<std::vector<llama_token>> stop_sequences;
  spdlog::debug("Adding stop sequences");
  for (unsigned i = 0; i < options.stop_sequences_len; i++) {
    auto string = std::string(options.stop_sequences[i]);
    auto tokens = llama_tokenize(
        session->model(), options.stop_sequences[i], false, true
    );

    spdlog::debug(
        "Stop sequence: `{:np}` ({}) ({})",
        spdlog::to_hex(string),
        options.stop_sequences[i],
        tokens
    );

    stop_sequences.push_back(tokens);
  }

  // Tokenize the prompt.
  spdlog::debug("Tokenizing the prompt");
  auto prompt_tokens =
      prompt == NULL ? std::vector<llama_token>()
                     : llama_tokenize(session->model(), prompt, false, true);

  auto n_prompt = prompt_tokens.size();
  auto n_target = n_prompt + n_eval;

  try {
    simularity_gpt_decode_internal(
        session,
        prompt_tokens,
        decode_progress_callback,
        decode_progress_callback_user_data
    );
  } catch (ContextOverflowError &e) {
    spdlog::error(e.what());
    return -2;
  } catch (UnknownDecodeError &e) {
    spdlog::error("Unknown decode error: {}", e.code);
    return -4;
  }

  auto batch = Batch(1);
  batch.add(prompt_tokens.back(), n_prompt - 1, true);

  std::vector<llama_token> eval_tokens;
  std::string eval_string;
  auto start = std::chrono::high_resolution_clock::now();

  while (eval_tokens.size() < n_eval) {
    try {
      llama_token next;

      try {
        next = sampling_ctx->sample(session->context);
      } catch (std::exception &e) {
        spdlog::error("Error at sample: {}", e.what());
        return -7;
      }

      if (next == llama_token_eos(session->model())) {
        // If we have a Lua instance, call on_eos(eval_string)
        // to get the new grammar. on_eos(eval_string) may return string or nil.
        if (lua_on_eos_function.has_value()) {
          spdlog::info("Calling Lua .on_eos({})", eval_string);

          try {
            auto new_grammar = lua_on_eos_function.value()(eval_string);

            if (new_grammar.get_type() != sol::type::lua_nil) {
              sampling_params.grammar = new_grammar;

              if (sampling_ctx->set_grammar(sampling_params.grammar.c_str()) !=
                  0) {
                spdlog::error("Failed to set new grammar");
                return -3;
              } else {
                spdlog::debug("Set new grammar");
              }

              eval_string.clear();
              continue;
            } else {
              spdlog::info("Stop: Lua .on_eos() returned nil");
              break;
            }
          } catch (const sol::error &e) {
            spdlog::error("Error during Lua .on_eos() call: {}", e.what());
            return -8;
          }
        } else {
          spdlog::info("Stop: EOS token");
          break;
        }
      }

      // Accept the token.
      sampling_ctx->accept(session->context, next);
      eval_tokens.push_back(next);
      session->prompt.push_back(next);

      // Convert the token to a piece.
      std::string piece;
      try {
        piece = llama_token_to_piece(session->model(), next, true);
      } catch (std::exception &e) {
        spdlog::warn("Failed to convert token to piece: ⌘{}", next);
        piece = "�";
      }

      // Call the inference callback.
      if (inference_callback != NULL) {
        if (!inference_callback(piece.c_str(), inference_callback_user_data)) {
          spdlog::info("Stop: inference callback returned false");
          break;
        }
      }

      bool found = false;
      for (auto &stop_sequence : stop_sequences) {
        if (eval_tokens.size() < stop_sequence.size() ||
            !std::equal(
                eval_tokens.end() - stop_sequence.size(),
                eval_tokens.end(),
                stop_sequence.begin()
            )) {
          continue;
        }

        spdlog::info("Stop: sequence found ({})", stop_sequence);
        found = true;

        break;
      }
      if (found) break;

      // Append the piece to the output string.
      eval_string += piece;

      // Clear the batch and add the single next token to it.
      batch.batch.n_tokens = 0;
      batch.add(next, n_prompt + eval_tokens.size(), true);

      // Decode the next token.
      auto err = llama_decode(session->context, batch.batch);
      if (err == 1) return -2; // Could not find a KV slot (context overflow).
      else if (err) {
        spdlog::warn("Failed to decode -> {}", err);
        return -6; // Decoding error.
      }
    } catch (std::exception &e) {
      spdlog::error("Unhandled error during inference loop: {}", e.what());
      return -100;
    }
  }

  auto end = std::chrono::high_resolution_clock::now();
  spdlog::info(
      "Inferenced {} tokens in {:.3f}s ({:.2f} tok/s)",
      eval_tokens.size(),
      (float)std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
              .count() /
          1000,
      (float)eval_tokens.size() /
          std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
  );

  return n_prompt + eval_tokens.size();
}
