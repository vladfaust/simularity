#pragma once

#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <utility>
#include <vector>

#include <llama.h>
#include <simularity.h>

#include "../../llama.cpp"
#include "spdlog/spdlog.h"

unsigned GPT_SESSIONS_TTL;
unsigned GPT_SESSIONS_MAX;

class Session {
public:
  Session(struct llama_context *ctx) : context(ctx) { this->touch(); }
  ~Session() { llama_free(this->context); }

  struct llama_context *context;
  std::mutex mutex;

  /// The committed (i.e. KV-cached) prompt tokens.
  std::vector<llama_token> prompt = {};

  /// When the session expires.
  std::chrono::time_point<std::chrono::system_clock> expired_at;

  // Decode progress callback (used internally to connect llama's
  // `cb_eval` with user-defined callbacks). See
  // `llama_universal_cb_eval` in `./create.cpp`.
  std::function<void()> decode_progress_callback;

  // Prolong the session expiration time by `GPT_SESSIONS_TTL` seconds.
  void touch() {
    if (GPT_SESSIONS_TTL) {
      expired_at = std::chrono::system_clock::now() +
                   std::chrono::seconds(GPT_SESSIONS_TTL);
    }
  }

  // Clear KV cache. Does not affect the `prompt`.
  bool clear_cache(int p0 = -1, int p1 = -1) {
    return llama_kv_cache_seq_rm(this->context, 0, p0, p1);
  }

  const llama_model *model() { return llama_get_model(this->context); }
};

/// A single-sequence `llama_batch` wrapper with a destructor.
class Batch {
public:
  struct llama_batch batch;

  Batch(int n_tokens) : batch(llama_batch_init(n_tokens, 0, 1)) {}

  /// Add a token to the batch.
  /// @returns The new number of tokens in the batch.
  int add(llama_token id, llama_pos pos, bool logits) {
    batch.token[batch.n_tokens]     = id;
    batch.pos[batch.n_tokens]       = pos;
    batch.n_seq_id[batch.n_tokens]  = 1;
    batch.seq_id[batch.n_tokens][0] = 0;
    batch.logits[batch.n_tokens]    = logits;
    return ++batch.n_tokens;
  }

  ~Batch() { llama_batch_free(this->batch); }
};

static std::atomic<unsigned> GPT_SESSIONS_COUNTER = 0;
static std::unordered_map<unsigned, std::shared_ptr<Session>> GPT_SESSIONS;
static std::mutex GPT_SESSIONS_MUTEX;

/**
  Lock a session by ID.

  @return A pair of session mutex lock and session pointer, or `std::nullopt`
    if the session does not exist.

  SAFETY: The sessions mutex is implicitly acquired.
 */
static std::optional<std::pair<std::unique_lock<std::mutex>, Session *>>
try_locking_session(unsigned session_id) {
  std::unique_lock sessions_lock(GPT_SESSIONS_MUTEX);
  auto it = GPT_SESSIONS.find(session_id);
  if (it == GPT_SESSIONS.end()) {
    return std::nullopt;
  } else {
    return std::make_pair(
        std::unique_lock(it->second->mutex), it->second.get()
    );
  }
}

/**
  Wrap `llama_decode` call with a progress callback.

  @param session The session.
  @param batch The batch to decode.
  @param n_tokens The number of tokens expected to be decoded.
  @param progress_callback The progress callback.

  @return The result of the `llama_decode` call.
 */
static int decode_with_progress(
    Session *session,
    llama_batch &batch,
    unsigned n_tokens,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
) {
  spdlog::info(
      "Decoding {} tokens in a batch of size {}", n_tokens, batch.n_tokens
  );

  unsigned current_call = 0;
  unsigned max_calls = n_tokens * 2 | 1; // Two calls per token (Key + Value).

  // Set the session's decode progress callback.
  if (progress_callback != NULL) {
    session->decode_progress_callback = [&current_call,
                                         progress_callback,
                                         max_calls,
                                         progress_callback_user_data]() {
      progress_callback(
          (float)++current_call / max_calls, progress_callback_user_data
      );
    };
  } else {
    session->decode_progress_callback = NULL;
  }

  // Decode the batch.
  auto start = std::chrono::high_resolution_clock::now();
  int result = llama_decode(session->context, batch);
  auto end   = std::chrono::high_resolution_clock::now();
  spdlog::info(
      "Decoded {} tokens in {:.3f}s ({:.2f} tok/s) -> {}",
      n_tokens,
      (float)std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
              .count() /
          1000,
      (float)n_tokens /
          std::chrono::duration_cast<std::chrono::seconds>(end - start).count(),
      result
  );

  // Clear the session's decode progress callback.
  session->decode_progress_callback = NULL;

  return result;
}
