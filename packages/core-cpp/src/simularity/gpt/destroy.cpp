#include <simularity.h>

#include "common.cpp"

int simularity_gpt_destroy(unsigned session_id) {
  // Acquire the GPT session mutex lock.
  std::unique_lock sessions_lock(GPT_SESSIONS_MUTEX);
  if (GPT_SESSIONS.find(session_id) == GPT_SESSIONS.end()) {
    return -1; // Session not found.
  }

  // Acquire the session mutex lock.
  std::unique_lock session_lock(GPT_SESSIONS[session_id]->mutex);

  // Destroy the session.
  GPT_SESSIONS.erase(session_id);

  return 0;
}
