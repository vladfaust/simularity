#include "./gpt/create.cpp"
#include "./gpt/decode.cpp"
#include "./gpt/destroy.cpp"
#include "./gpt/infer.cpp"
#include "./gpt/token_length.cpp"

void simularity_gpt_init(unsigned gpt_sessions_ttl, unsigned gpt_sessions_max) {
  GPT_SESSIONS_TTL = gpt_sessions_ttl;
  GPT_SESSIONS_MAX = gpt_sessions_max;
}

bool simularity_gpt_touch(unsigned session_id) {
  // Try locking the session.
  auto lock = try_locking_session(session_id);
  if (!lock.has_value()) {
    // Session does not exist.
    spdlog::debug("Session not found: {}", session_id);
    return false;
  }

  if (GPT_SESSIONS_TTL) {
    // Check if the session is expired.
    auto now = std::chrono::system_clock::now();

    if (lock->second->expired_at < now) {
      // Session has expired.
      spdlog::debug("Session has already expired: {}", session_id);

      // Remove the session from the sessions map (would delete the session).
      GPT_SESSIONS.erase(session_id);

      return false;
    } else {
      spdlog::debug("Prolonging session: {}", session_id);

      // Prolong the session expiration time.
      lock->second->touch();

      return true;
    }
  } else {
    // No TTL, return true.
    return true;
  }
}
