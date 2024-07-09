#include "./gpt/commit.cpp"
#include "./gpt/create.cpp"
#include "./gpt/decode.cpp"
#include "./gpt/destroy.cpp"
#include "./gpt/infer.cpp"
#include "./gpt/reset.cpp"

void simularity_gpt_init(unsigned gpt_sessions_ttl, unsigned gpt_sessions_max) {
  GPT_SESSIONS_TTL = gpt_sessions_ttl;
  GPT_SESSIONS_MAX = gpt_sessions_max;
}
