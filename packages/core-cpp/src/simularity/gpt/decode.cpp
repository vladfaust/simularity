#pragma once

#include <_types/_uint32_t.h>
#include <llama.h>
#include <simularity.h>
#include <spdlog/fmt/fmt.h>
#include <spdlog/spdlog.h>

#include <vector>

#include "../../llama.cpp"
#include "common.cpp"

struct ContextOverflowError : public std::runtime_error {
  ContextOverflowError(uint32_t max, uint32_t given) :
      std::runtime_error(
          fmt::format("Context overflow (max: {}, given: {})", max, given)
      ) {}
};

struct UnknownDecodeError : public std::runtime_error {
  int code;

  UnknownDecodeError(int code) :
      std::runtime_error(fmt::format("Unknown decode error: {}", code)),
      code(code) {}
};

/**
 * @param prompt The *full* prompt to decode.
 * @param batch_size The returned batch size.
 * @return The decoded {@link Batch} instance.
 */
static std::unique_ptr<Batch> simularity_gpt_decode_internal(
    Session *session,
    std::vector<llama_token> prompt,
    size_t batch_size,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
);

int simularity_gpt_decode(
    unsigned session_id,
    const char *prompt,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
) {
  // Acquire the session.
  auto locking_result = try_locking_session(session_id);
  if (!locking_result.has_value()) return -1; // Session not found.
  auto [_, session] = std::move(locking_result.value());
  spdlog::info("Decoding prompt for session {}", session_id);

  // Tokenize the prompt.
  auto prompt_tokens = llama_tokenize(session->model(), prompt, false, true);

  // Decode the prompt.
  try {
    simularity_gpt_decode_internal(
        session,
        prompt_tokens,
        prompt_tokens.size(),
        progress_callback,
        progress_callback_user_data
    );

    // Return the new context size.
    return session->prompt.size();
  } catch (ContextOverflowError &e) {
    spdlog::error(e.what());
    return -2;
  } catch (UnknownDecodeError &e) {
    spdlog::error("Unknown decode error: {}", e.code);
    return e.code;
  }
}

static std::unique_ptr<Batch> simularity_gpt_decode_internal(
    Session *session,
    std::vector<llama_token> prompt,
    size_t batch_size,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
) {
  auto n_prompt = prompt.size();
  if (n_prompt > llama_n_batch(session->context)) {
    spdlog::error(
        "Prompt is too long ({} tokens, max {})",
        n_prompt,
        llama_n_batch(session->context)
    );

    throw ContextOverflowError(llama_n_batch(session->context), n_prompt);
  }

  auto n_session = session->prompt.size();
  size_t n_match;

  for (n_match = 0; n_match < n_prompt; n_match++) {
    if (n_match == n_session || session->prompt[n_match] != prompt[n_match]) {
      break;
    }
  }

  spdlog::debug(
      "n_prompt = {}, n_session = {}, n_match = {}",
      n_prompt,
      n_session,
      n_match
  );

  // Clear the KV cache starting from the first non-matching token.
  session->clear_cache(n_match);

  auto batch = std::make_unique<Batch>(batch_size);

  if (n_match == n_prompt) {
    spdlog::debug("Prompt is already fully decoded");
    n_match--;
  } else if (n_match > 0) {
    if (n_match < n_session) {
      // Add the latest matching token.
      //

      spdlog::debug(
          "Will reuse session KV cache until token #{}¹ (⌘{}), inclusive",
          n_match,
          prompt[n_match - 1]
      );

      batch->add(prompt[n_match - 1], n_match - 1, false);
    } else if (n_match == n_session) {
      // Add the latest token from the session.
      //

      spdlog::debug(
          "Will reuse session KV cache until token #{}¹ (⌘{}), inclusive",
          n_session,
          session->prompt.back()
      );

      batch->add(session->prompt.back(), n_session - 1, false);
    } else {
      spdlog::error("n_match > n_session ({} > {})", n_match, n_session);
      throw std::runtime_error("n_match > n_session");
    }

  } else {
    spdlog::debug("Session KV cache is not reused");
  }

  // Add the new prompt tokens.
  for (auto j = n_match; j < n_prompt; j++) {
    batch->add(
        prompt[j],
        j,

        // The latest token will become the new head.
        j == n_prompt - 1
    );
  }

  // Decode the batch, KV-caching the new head logits.
  int err = decode_with_progress(
      session,
      batch->batch,
      n_prompt - n_match, // Expected number of tokens to decode.
      progress_callback,
      progress_callback_user_data
  );
  if (err == 1)
    throw ContextOverflowError(llama_n_batch(session->context), n_prompt);
  else if (err) throw UnknownDecodeError(err);

  // Update the session's prompt.
  session->prompt = prompt;

  // Prolong the session expiration time.
  session->touch();

  // Return the decoded batch.
  return batch;
}
