#include <simularity.h>

#include "common.cpp"

int simularity_gpt_commit(unsigned session_id) {
  // Acquire the session.
  auto locking_result = try_locking_session(session_id);
  if (!locking_result.has_value()) return -1; // Session not found.
  auto [_, session] = std::move(locking_result.value());

  // Commit the prompt (append `uncommitted_prompt` to `committed_prompt`).
  session->committed_prompt.insert(
      session->committed_prompt.end(),
      session->uncommitted_prompt.begin(),
      session->uncommitted_prompt.end()
  );
  session->uncommitted_prompt.clear();

  // Return the new committed prompt size as the context size.
  return session->committed_prompt.size();
}
