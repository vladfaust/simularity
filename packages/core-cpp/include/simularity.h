#ifndef SIMULARITY_H
#define SIMULARITY_H

#ifdef __cplusplus
extern "C" {
#endif // __cplusplus

/**
  Initialize the Simularity backend.
  Must be called once before any other function.

  @param gpt_sessions_ttl The time-to-live for GPT sessions in seconds.
  @param gpt_sessions_max The maximum number of GPT sessions allowed.
 */
void simularity_init(unsigned gpt_sessions_ttl, unsigned gpt_sessions_max);

/**
  Load a model from the given path into the model map.

  @param model_path Path to the model file.
  @param model_id Unique identifier for the model.
  @param progress_callback Callback function to report progress from 0 to 1.
    If the provided progress_callback returns true, model loading continues.
    If it returns false, model loading is immediately aborted.
  @param progress_callback_user_data User data for the progress callback.

  @return 0 on success.
  @return -1 if a model with the same ID already exists.
  @return -2 if there was an error loading the model.

  SAFETY: `simularity_model_*` functions are NOT thread-safe.
  TODO: Return some model data.
  TODO: Find an existing model by ID.
 */
int simularity_model_load(
    const char *model_path,
    const char *model_id,
    bool(progress_callback)(float, void *),
    void *progress_callback_user_data
);

/**
  Unload a model with the given ID.
  @param model_id Unique identifier for the model.
  @return 0 on success, -1 if the model not found.
  SAFETY: `simularity_model_*` functions are NOT thread-safe.
 */
int simularity_model_unload(const char *model_id);

/**
  Create a new GPT session with the given model ID and initial prompt.

  @param model_id The model ID.
  @param context_size The context size, zero for default.
  @param initial_prompt The initial prompt, may be NULL.
  @param state_file_path The path to a file to load the session state from
    or save it to. May be NULL. Ignored if initial prompt is NULL.
  @param progress_callback Callback function to report progress from 0 to 1.
    Ignored if initial prompt is NULL.

  @return The session ID on success.
  @return -1 if the model was not found.
  @return -2 if the maximum number of sessions has been reached.
  @return -3 if there was an error creating the session.
  @return -4 upon decoding error.
  @return <0 on other errors.

  SAFETY: This function is threadsafe: it locks the sessions map mutex,
  and then the new session mutex.

  TODO: Return some session data.
 */
int simularity_gpt_create(
    const char *model_id,
    unsigned context_size,
    const char *initial_prompt,
    const char *state_file_path,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
);

/**
  Clear the uncommitted prompt, and decode the given prompt.

  @param session_id The session ID.
  @param prompt The prompt to decode.
  @param progress_callback Callback function to report progress from 0 to 1.

  @returns New context length on success.
  @returns -1 when session not found.
  @returns -2 on context overflow.
  @returns <0 on other decode error.

  SAFETY: `simularity_gpt_*` functions are thread-safe.
 */
int simularity_gpt_decode(
    unsigned session_id,
    const char *prompt,
    void(progress_callback)(float, void *),
    void *progress_callback_user_data
);

struct simularity_gpt_inference_options {
  int n_prev           = 64; // number of previous tokens to remember
  int n_probs          = 0;  // if greater than 0,
                             // output the probabilities of top n_probs tokens.
  int min_keep         = 0; // 0 = disabled, otherwise samplers should return at
                            // least min_keep tokens
  int top_k            = 40;       // <= 0 to use vocab size
  float top_p          = 0.95f;    // 1.0 = disabled
  float min_p          = 0.05f;    // 0.0 = disabled
  float tfs_z          = 1.00f;    // 1.0 = disabled
  float typical_p      = 1.00f;    // 1.0 = disabled
  float temp           = 0.80f;    // <= 0.0 to sample greedily,
                                   // 0.0 to not output probabilities
  float dynatemp_range = 0.00f;    // 0.0 = disabled
  float dynatemp_exponent = 1.00f; // controls how entropy maps to temperature
                                   // in dynamic temperature sampler
  int penalty_last_n      = 64;    // last n tokens to penalize
                                   // (0 = disable penalty, -1 = context size)
  float penalty_repeat    = 1.00f; // 1.0 = disabled
  float penalty_freq      = 0.00f; // 0.0 = disabled
  float penalty_present   = 0.00f; // 0.0 = disabled
  int mirostat            = 0; // 0 = disabled, 1 = mirostat, 2 = mirostat 2.0
  float mirostat_tau      = 5.00f; // target entropy
  float mirostat_eta      = 0.10f; // learning rate
  bool penalize_nl        = false; // consider newlines as a repeatable token
  unsigned seed           = 0xFFFFFFFF; // the seed used to initialize
                                        // llama_sampling_context

  const char *grammar               = nullptr;
  const unsigned stop_sequences_len = 0;
  const char **stop_sequences       = nullptr;
};

/**
  Get the default inference options.
 */
struct simularity_gpt_inference_options
simularity_gpt_inference_options_default() {
  return simularity_gpt_inference_options{};
}

/**
  Infer from the given prompt, or continue the inference from the last prompt.
  Would clear the uncommitted prompt.

  @param session_id The session ID.
  @param prompt The prompt to infer from (may be NULL).
  @param n_eval The number of evaluations to perform.
  @param options Inference options.
  @param decode_progress_callback Callback function to report
    decode progress from 0 to 1.
  @param inference_callback Callback function to report inference output.
    Return true to continue inference, false to stop.

  @returns # of tokens generated on success.
  @returns -1 when session not found.
  @returns -2 on context overflow.
  @returns -3 on failure to initialize sampling (likely a grammar error).
  @returns <0 on other error.

  SAFETY: `simularity_gpt_*` functions are thread-safe.
  NOTE: Stop sequences are NOT added to the KV cache, yet yielded in the output.
  It's a client's responsibility to trim the output's end.
 */
int simularity_gpt_infer(
    unsigned session_id,
    const char *prompt,
    unsigned n_eval,
    const struct simularity_gpt_inference_options options,
    void(decode_progress_callback)(float, void *),
    void *decode_progress_callback_user_data,
    bool(inference_callback)(const char *output, void *),
    void *inference_callback_user_data
);

/**
  Commit the uncommitted prompt to the session.

  @param session_id The session ID.
  @return New context length on success, -1 when session not found.

  SAFETY: `simularity_gpt_*` functions are thread-safe.
 */
int simularity_gpt_commit(unsigned session_id);

/**
  Reset the GPT session to its initial prompt.

  @param session_id The session ID.
  @return New context length on success, -1 when session not found.

  SAFETY: `simularity_gpt_*` functions are thread-safe.
 */
int simularity_gpt_reset(unsigned session_id);

/**
  Destroy the GPT session.

  @param session_id The session ID.
  @return 0 on success, -1 when session not found.

  SAFETY: `simularity_gpt_*` functions are thread-safe.
 */
int simularity_gpt_destroy(unsigned session_id);

#ifdef __cplusplus
}
#endif // __cplusplus

#endif // SIMULARITY_H
