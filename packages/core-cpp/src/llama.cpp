#pragma once

#include "spdlog/spdlog.h"
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

#include <llama.h>

std::unordered_map<std::string, llama_model *> LLAMA_MODELS = {};
std::mutex LLAMA_MODELS_MUTEX;

std::vector<llama_token> llama_tokenize(
    const llama_model *model,
    const char *text,
    bool add_special,
    bool parse_special
) {
  std::vector<llama_token> tokens;
  auto text_len       = strlen(text);
  size_t n_tokens_max = text_len;
  tokens.resize(n_tokens_max);

  spdlog::debug("Before llama_tokenize");
  auto n_tokens = llama_tokenize(
      model, text, text_len, tokens.data(), text_len, add_special, parse_special
  );
  spdlog::debug("After llama_tokenize: {}", n_tokens);

  if (n_tokens >= 0) {
    tokens.resize(n_tokens);
  } else {
    spdlog::error("Failed to tokenize the text");
    // FIXME: Catch the exception outside.
    throw std::runtime_error("Failed to tokenize the text.");
  }

  return tokens;
}

size_t LAMA_MAX_PIECE_SIZE = 16;

std::string llama_token_to_piece(
    const struct llama_model *model, const llama_token token, bool special
) {
  char buf[LAMA_MAX_PIECE_SIZE];
  auto len =
      llama_token_to_piece(model, token, buf, LAMA_MAX_PIECE_SIZE, special);
  if (len < 0) throw std::runtime_error("Failed to convert token to piece.");
  return std::string(buf, len);
}

llama_token llama_sample_token_with_rng(
    struct llama_context *ctx,
    llama_token_data_array *candidates,
    std::mt19937 &rng
) {
  GGML_ASSERT(ctx);

  const int64_t t_start_sample_us = ggml_time_us();
  llama_sample_softmax(nullptr, candidates);

  std::vector<float> probs;
  probs.reserve(candidates->size);
  for (size_t i = 0; i < candidates->size; ++i) {
    probs.push_back(candidates->data[i].p);
  }

  std::discrete_distribution<> dist(probs.begin(), probs.end());
  int idx = dist(rng);

  llama_token result = candidates->data[idx].id;

  // FIXME: The context struct is opaque, so we can't access these fields.
  // ctx->t_sample_us += ggml_time_us() - t_start_sample_us;
  // ctx->n_sample++;

  return result;
}
