#pragma once

#include <codecvt>
#include <filesystem>
#include <locale>
#include <memory>
#include <utility>
#include <vector>

#include <llama.h>
#include <spdlog/spdlog.h>

#include "common.cpp"
#include "decode.cpp"

static bool llama_universal_cb_eval(ggml_tensor *, bool, void *user_data) {
  // Cast the user data to unsigned, this is the session ID.
  unsigned session_id = *static_cast<unsigned *>(user_data);

  if (GPT_SESSIONS[session_id]->decode_progress_callback) {
    GPT_SESSIONS[session_id]->decode_progress_callback();
  }

  return false; // See https://github.com/ggerganov/llama.cpp/discussions/8051.
}

int simularity_gpt_create(
    const char *model_id,
    unsigned n_ctx,
    unsigned n_batch,
    const char *initial_prompt,
    const char *state_file_path,
    llama_progress_callback progress_callback,
    void *progress_callback_user_data
) {
  spdlog::debug(
      "simularity_gpt_create(model_id: {}, n_ctx: {}, n_batch: {}, "
      "initial_prompt: {}, "
      "state_file_path: {}, progress_callback: {})",
      model_id,
      n_ctx,
      n_batch,
      initial_prompt ? "<Some>" : "<None>",
      state_file_path ? state_file_path : "<None>",
      progress_callback ? "<Some>" : "<None>"
  );

  // Acquire the models mutex.
  spdlog::debug("Acquiring models lock");
  std::unique_lock models_lock(LLAMA_MODELS_MUTEX);

  // Check if the model exists.
  spdlog::debug("Checking model: {}", model_id);
  if (LLAMA_MODELS.find(model_id) == LLAMA_MODELS.end()) {
    spdlog::error("Model does not exist: {}", model_id);
    return -1; // Model does not exist.
  }
  spdlog::info("Model exists: {}", model_id);

  // Acquire the GPT session mutex.
  std::unique_lock sessions_lock(GPT_SESSIONS_MUTEX);

  // Check if the maximum number of sessions has been reached.
  if (GPT_SESSIONS_MAX > 0 && GPT_SESSIONS.size() >= GPT_SESSIONS_MAX) {
    // If there is no TTL, it means that no new sessions
    // can be created until one is removed.
    if (!GPT_SESSIONS_TTL) {
      return -2; // Maximum number of sessions reached.
    }

    // Find the first expired session and remove it.
    // OPTIMIZE: Use a priority queue to store the sessions ordered by
    // expiration time.
    bool found = false;
    for (auto it = GPT_SESSIONS.begin(); it != GPT_SESSIONS.end(); ++it) {
      if (it->second->expired_at < std::chrono::system_clock::now()) {
        GPT_SESSIONS.erase(it);
        found = true;
        break;
      }
    }

    if (!found) {
      return -2; // Maximum number of sessions reached.
    }
  }

  // NOTE: The atomic is not incremented yet.
  const unsigned session_id = GPT_SESSIONS_COUNTER + 1;

  // Create new llama context.
  //

  llama_context_params params = llama_context_default_params();
  params.n_ctx                = n_ctx;
  if (n_batch > 0) params.n_batch = n_batch; // NOTE: Affects state loading.
  params.cb_eval           = llama_universal_cb_eval;
  // Cast the session ID to void * and pass it as user data.
  params.cb_eval_user_data = static_cast<void *>(new unsigned(session_id));
  params.flash_attn        = true; // NOTE: Affects state loading.
  // params.rope_freq_base       = 100000;
  // params.rope_freq_scale      = 1;

  spdlog::debug("Creating GPT session...", session_id);

  struct llama_context *ctx =
      llama_new_context_with_model(LLAMA_MODELS[model_id]->model, params);

  spdlog::info("Created GPT session with ID: {}", session_id);
  models_lock.unlock(); // Release the llama models mutex.

  if (ctx == NULL) {
    return -3; // Error creating the context.
  }

  // Create a new session.
  GPT_SESSIONS_COUNTER++; // Actually increment the atomic counter.
  auto session = std::make_shared<Session>(ctx);
  GPT_SESSIONS.insert({session_id, session});
  sessions_lock.unlock(); // Release the GPT sessions mutex.
  spdlog::debug("Inserted session");

  // Acquire the session mutex.
  std::unique_lock session_lock(session->mutex);
  spdlog::debug("Acquired session lock");

  // If there is an initial prompt, calculate its hash.
  // Check if there is a file with the same hash.
  //
  // If yes, load the context from the file.
  // Otherwise: tokenize the prompt, decode it and if dump_state is true, save
  // the context to a file.
  //

  if (initial_prompt != NULL) {
    spdlog::debug("Processing initial prompt");

    bool state_loaded = false;
    bool file_exists  = false;

    if (state_file_path != NULL) {
      // Convert the path to wide string for Windows.
      // OPTIMIZE: Ifdef WIN32.
      std::wstring_convert<std::codecvt_utf8_utf16<wchar_t>> converter;
      const auto wpath = converter.from_bytes(state_file_path);

      // TODO: Add metadata to the path, depending on model, params, etc.
      spdlog::debug("Checking state file: {}", state_file_path);
      file_exists = std::filesystem::exists(wpath);

      if (file_exists) {
        auto file_size = std::filesystem::file_size(wpath);
        spdlog::debug(
            "Loading session state from file: {} ({} bytes)",
            state_file_path,
            file_size
        );

        size_t max_tokens =
            n_ctx | llama_n_ctx_train(LLAMA_MODELS[model_id]->model);
        std::vector<llama_token> tokens_list;
        tokens_list.resize(max_tokens);
        size_t n_tokens;

        // TODO: Better progress reporting.
        if (progress_callback != NULL) {
          spdlog::debug("Calling progress callback with value 0");
          progress_callback(0, progress_callback_user_data);
        }

        state_loaded = llama_state_load_file(
            ctx, state_file_path, tokens_list.data(), max_tokens, &n_tokens
        );
        spdlog::debug("State loaded: {} ({} tokens)", state_loaded, n_tokens);

        if (state_loaded) {
          tokens_list.resize(n_tokens);

          if (progress_callback != NULL) {
            spdlog::debug("Calling progress callback with value 1");
            progress_callback(1, progress_callback_user_data);
          }

          session->prompt = tokens_list;
        } else {
          // Not fatal, the file may be corrupted.
          spdlog::error(
              "Failed to load session state from file: {}", state_file_path
          );
        }
      }
    }

    if (!state_loaded) {
      spdlog::debug("Tokenizing and decoding initial prompt");

      // Tokenize the initial prompt.
      auto tokens_list = llama_tokenize(
          LLAMA_MODELS[model_id]->model, initial_prompt, false, false
      );

      // Decode the initial prompt.
      try {
        simularity_gpt_decode_internal(
            session.get(),
            tokens_list,
            progress_callback,
            progress_callback_user_data
        );
        spdlog::info("Decoded initial prompt");
      } catch (ContextOverflowError &e) {
        spdlog::error(e.what());
        return -4;
      } catch (UnknownDecodeError &e) {
        spdlog::error("Unknown decode error: {}", e.code);
        return e.code;
      }

      if (state_file_path && !state_loaded) {
        spdlog::debug("Saving session state to file: {}", state_file_path);

        // Save the session to a file.
        auto saved = llama_state_save_file(
            ctx, state_file_path, tokens_list.data(), tokens_list.size()
        );

        if (saved) {
          // Convert the path to wide string for Windows.
          // OPTIMIZE: Ditto.
          std::wstring_convert<std::codecvt_utf8_utf16<wchar_t>> converter;
          const auto wpath = converter.from_bytes(state_file_path);

          auto file_size = std::filesystem::file_size(wpath);
          spdlog::info(
              "Saved session state to file: {} ({} bytes)",
              state_file_path,
              file_size
          );
        } else {
          spdlog::error(
              "Failed to save session state to file: {}", state_file_path
          );
        }
      }
    }
  }

  return session_id;
}
