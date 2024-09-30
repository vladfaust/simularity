#pragma once

#include <cstdint>
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
 * Decode a prompt in batches of default context size, reusing and updating the
 * session's KV cache.
 * @param prompt The *full* prompt to decode.
 */
static void simularity_gpt_decode_internal(
    Session *session,
    std::vector<llama_token> prompt,
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
        session, prompt_tokens, progress_callback, progress_callback_user_data
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

static void simularity_gpt_decode_internal(
    Session *session,
    std::vector<llama_token> prompt,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
) {
  auto batch_size = llama_n_batch(session->context);

  auto n_prompt = prompt.size();
  if (n_prompt > llama_n_ctx(session->context)) {
    spdlog::error(
        "Prompt is too long ({} tokens, max {})",
        n_prompt,
        llama_n_ctx(session->context)
    );

    throw ContextOverflowError(llama_n_ctx(session->context), n_prompt);
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

  auto batch = Batch(batch_size);

  if (n_match == n_prompt) {
    spdlog::info("Prompt is already fully decoded");
  } else if (n_match > 0) {
    if (n_match < n_session) {
      spdlog::info(
          "Will reuse session KV cache until token #{}¹ (⌘{}), inclusive",
          n_match,
          prompt[n_match - 1]
      );
    } else if (n_match == n_session) {
      spdlog::info(
          "Will reuse session KV cache until token #{}¹ (⌘{}), inclusive",
          n_session,
          session->prompt.back()
      );
    } else {
      spdlog::error("n_match > n_session ({} > {})", n_match, n_session);
      throw std::runtime_error("n_match > n_session");
    }
  } else {
    spdlog::info("Session KV cache is not reused");
  }

  const int n_batches = ceil((float)(n_prompt - n_match) / batch_size);

  if (n_batches > 0) {
    spdlog::info(
        "Will decode {} tokens in {} batch(es) of size {}",
        n_prompt - n_match,
        n_batches,
        batch_size
    );
  }

  for (int i = 0; i < n_batches; i++) {
    const auto from = i * batch_size + n_match;
    const auto to   = std::min(from + batch_size, n_prompt);
    spdlog::debug("Decoding batch #{}¹ (tokens {}¹-{}¹)", i + 1, from + 1, to);

    // Add the new prompt tokens.
    for (auto j = from; j < to; j++) {
      batch.add(
          prompt[j],
          j,

          // Calculate the logits for the last token.
          j == (to - 1)
      );
    }

    // Decode the batch, KV-caching the new head logits.
    int err = decode_with_progress(
        session,
        batch.batch,
        i,
        n_prompt - n_match,
        progress_callback,
        progress_callback_user_data
    );
    if (err == 1)
      throw ContextOverflowError(llama_n_batch(session->context), n_prompt);
    else if (err) throw UnknownDecodeError(err);

    // Clear the batch.
    batch.batch.n_tokens = 0;
  }

  // Update the session's prompt.
  session->prompt = prompt;

  // Prolong the session expiration time.
  session->touch();
}
