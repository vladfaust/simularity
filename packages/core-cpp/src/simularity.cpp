#include <filesystem>

#include <llama.h>
#include <mutex>
#include <simularity.h>
#include <spdlog/spdlog.h>

#include "./simularity/gpt.cpp"

extern "C" void
simularity_init(unsigned gpt_sessions_ttl, unsigned gpt_sessions_max) {
  simularity_gpt_init(gpt_sessions_ttl, gpt_sessions_max);
  llama_backend_init();
  spdlog::set_level(spdlog::level::debug);
  spdlog::set_pattern("[%H:%M:%S.%e] [libsimularity] [%^%l%$] %v");
  spdlog::info("Initialized");
}

extern "C" int simularity_model_load(
    const char *model_path,
    const char *model_id,
    llama_progress_callback progress_callback,
    void *progress_callback_user_data
) {
  spdlog::debug(
      "simularity_model_load(model_path: {}, model_id: {}, "
      "progress_callback: {})",
      model_path,
      model_id,
      progress_callback ? "<Some>" : "<None>"
  );

  // Acquire the models mutex lock.
  spdlog::debug("Acquiring models lock");
  std::unique_lock models_lock(LLAMA_MODELS_MUTEX);

  // Check if a model with the same ID already exists.
  if (LLAMA_MODELS.find(model_id) != LLAMA_MODELS.end()) {
    return -1; // Model with the same ID already exists.
  }

  // Params for the model.
  llama_model_params params          = llama_model_default_params();
  params.progress_callback           = progress_callback;
  params.progress_callback_user_data = progress_callback_user_data;
  // params.n_gpu_layers                = 32;

  // Load the model.
  struct llama_model *model = llama_load_model_from_file(model_path, params);
  if (model == NULL) {
    return -2; // Error loading the model.
  }

  // Add the model to the list.
  LLAMA_MODELS.insert({model_id, model});
  spdlog::info(
      "Model loaded: {}, n_params: {}, size: {}, n_ctx_train: {}",
      model_id,
      llama_model_n_params(model),
      llama_model_size(model),
      llama_n_ctx_train(model)
  );

  return 0;
}

extern "C" int simularity_model_unload(const char *model_id) {
  spdlog::debug("simularity_model_unload(model_id: {})", model_id);

  // Acquire the models mutex lock.
  spdlog::debug("Acquiring models lock");
  std::unique_lock models_lock(LLAMA_MODELS_MUTEX);

  // Check if the model exists.
  if (LLAMA_MODELS.find(model_id) == LLAMA_MODELS.end()) {
    return -1; // Model does not exist.
  }

  // Unload the model.
  llama_free_model(LLAMA_MODELS[model_id]);

  // Remove the model from the list.
  LLAMA_MODELS.erase(model_id);

  return 0;
}
