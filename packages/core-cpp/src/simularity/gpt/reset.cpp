#include <simularity.h>

#include "common.cpp"
#include "llama.h"

int simularity_gpt_reset(unsigned session_id) {
  // Acquire the session.
  auto locking_result = try_locking_session(session_id);
  if (!locking_result.has_value()) return -1; // Session not found.
  auto [_, session] = std::move(locking_result.value());

  // Reset the session back to the initial prompt.
  llama_kv_cache_seq_rm(session->context, 0, session->initial_prompt_size, -1);
  session->committed_prompt.resize(session->initial_prompt_size);
  session->uncommitted_prompt.clear();

  // Return the new committed prompt size as the context size.
  return session->committed_prompt.size();
}
