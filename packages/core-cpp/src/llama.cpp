#pragma once

#include <cstdint>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

#include <llama.h>
#include <spdlog/spdlog.h>

class LlamaModel {
public:
  std::string path;
  llama_model *model;

  /// The hash of the model file, memoized.
  uint64_t xx64_hash = 0;

  LlamaModel(const char *path, llama_model *model) : path(path), model(model) {}

  ~LlamaModel() { llama_free_model(model); }
};

std::unordered_map<std::string, std::shared_ptr<LlamaModel>> LLAMA_MODELS = {};
std::mutex LLAMA_MODELS_MUTEX;

std::vector<llama_token> llama_tokenize(
    const llama_model *model,
    const char *text,
    bool add_special,
    bool parse_special
) {
  std::vector<llama_token> tokens;
  auto text_len       = strlen(text);
  size_t n_tokens_max = text_len + 1;
  tokens.resize(n_tokens_max);

  spdlog::debug(
      "llama_tokenize(n_tokens_max: {}, add_special: {}, parse_special: {})",
      n_tokens_max,
      add_special,
      parse_special
  );
  auto n_tokens = llama_tokenize(
      model,
      text,
      text_len,
      tokens.data(),
      n_tokens_max,
      add_special,
      parse_special
  );
  spdlog::debug("llama_tokenize -> {}", n_tokens);

  if (n_tokens >= 0) {
    tokens.resize(n_tokens);
  } else {
    spdlog::error("Failed to tokenize the text");
    // FIXME: Catch the exception outside.
    throw std::runtime_error("Failed to tokenize the text.");
  }

  return tokens;
}

const size_t LLAMA_MAX_PIECE_SIZE = 32;

std::string llama_token_to_piece(
    const struct llama_model *model, const llama_token token, bool special
) {
  char buf[LLAMA_MAX_PIECE_SIZE];
  auto len =
      llama_token_to_piece(model, token, buf, LLAMA_MAX_PIECE_SIZE, 0, special);
  if (len < 0) throw std::runtime_error("Failed to convert token to piece.");
  return std::string(buf, len);
}
