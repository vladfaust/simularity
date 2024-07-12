#pragma once

#include <llama.h>
#include <simularity.h>
#include <spdlog/spdlog.h>

#include <vector>

#include "../../llama.cpp"
#include "common.cpp"

static int simularity_gpt_decode_internal(
    Session *session,
    std::vector<llama_token> tokens,
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
  return simularity_gpt_decode_internal(
      session, prompt_tokens, progress_callback, progress_callback_user_data
  );
}

static int simularity_gpt_decode_internal(
    Session *session,
    std::vector<llama_token> tokens,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
) {
  auto n_session = session->committed_prompt.size();
  auto batch     = new Batch(n_session + tokens.size(), 0, 1);

  if (!n_session) {
    // When the session is empty, set the tokens as the committed prompt.
    spdlog::debug("Session is empty");

    for (unsigned i = 0; i < tokens.size(); i++) {
      batch->add(
          tokens[i],
          i,
          {0},

          // The latest token will become the head,
          // that is a token with cached logits.
          i == tokens.size() - 1
      );
    }

    int err = decode_with_progress(
        session,
        batch->batch,
        tokens.size() * 2,
        progress_callback,
        progress_callback_user_data
    );
    if (err == 1) return -2; // Could not find a KV slot for the batch.
    else if (err) return err;

    // Set the committed prompt to the prompt tokens.
    session->committed_prompt = tokens;
  } else {
    // The session is not empty.
    //
    spdlog::debug("Session is not empty");

    // Add the current head.
    batch->add(
        session->committed_prompt.back(),
        n_session - 1,
        {0},

        // It must have logits.
        true
    );

    // Add the prompt tokens.
    for (unsigned i = 0; i < tokens.size(); i++) {
      batch->add(
          tokens[i],
          n_session + i,
          {0},

          // The latest token will become the new head.
          i == tokens.size() - 1
      );
    }

    // Decode the batch, caching the new head logits.
    int err = decode_with_progress(
        session,
        batch->batch,
        tokens.size() * 2,
        progress_callback,
        progress_callback_user_data
    );
    if (err == 1) return -2; // Could not find a KV slot for the batch.
    else if (err) return err;

    // Extend the committed prompt with the prompt tokens.
    session->committed_prompt.insert(
        session->committed_prompt.end(), tokens.begin(), tokens.end()
    );
  }

  // Prolong the session expiration time.
  session->touch();

  // Return the new context size.
  return session->committed_prompt.size();
}
