#include <llama.h>
#include <simularity.h>
#include <spdlog/spdlog.h>

#include "common.cpp"

int simularity_gpt_token_length(const char *model_id, const char *prompt) {
  spdlog::debug("simularity_gpt_token_length(model_id: {})", model_id);

  // Acquire the models mutex.
  spdlog::debug("Acquiring models lock");
  std::unique_lock models_lock(LLAMA_MODELS_MUTEX);

  // Check if the model exists.
  spdlog::debug("Checking model: {}", model_id);
  if (LLAMA_MODELS.find(model_id) == LLAMA_MODELS.end()) {
    spdlog::error("Model does not exist: {}", model_id);
    return -1; // Model does not exist.
  }
  spdlog::info("Model exists: {}", model_id);

  try {
    // Tokenize the prompt.
    auto prompt_tokens =
        llama_tokenize(LLAMA_MODELS[model_id]->model, prompt, false, false);
    return prompt_tokens.size();
  } catch (const std::runtime_error &e) {
    spdlog::error("Failed to tokenize the prompt: {}", e.what());
    return -2;
  }
}
