#include <string>

#include <ggml.h>
#include <xxhash.h>

static XXH64_hash_t gguf_hash_xx64(const char *fname) {
  struct ggml_context *ctx_data = NULL;

  struct gguf_init_params params = {
      /*.no_alloc = */ false,
      /*.ctx      = */ &ctx_data,
  };

  XXH64_state_t *xxh64_model_hash_state = NULL;

  xxh64_model_hash_state = XXH64_createState();
  if (xxh64_model_hash_state == NULL) {
    return -1;
  }

  XXH64_hash_t const seed = 0;
  if (XXH64_reset(xxh64_model_hash_state, seed) == XXH_ERROR) {
    XXH64_freeState(xxh64_model_hash_state);
    return -1;
  }

  struct gguf_context *ctx = gguf_init_from_file(fname, params);
  if (ctx == NULL) {
    XXH64_freeState(xxh64_model_hash_state);
    return -1;
  }

  const int n_tensors            = gguf_get_n_tensors(ctx);
  bool tensor_layer_in_manifest  = false;
  bool model_in_manifest         = false;
  bool tensor_layer_has_mismatch = false;
  bool model_has_mismatch        = false;

  for (int i = 0; i < n_tensors; ++i) {
    const char *name        = gguf_get_tensor_name(ctx, i);
    struct ggml_tensor *cur = ggml_get_tensor(ctx_data, name);
    auto n_bytes            = ggml_nbytes(cur);
    auto *raw_data          = cur->data;

    if (XXH64_update(xxh64_model_hash_state, raw_data, n_bytes) == XXH_ERROR) {
      XXH64_freeState(xxh64_model_hash_state);
      ggml_free(ctx_data);
      gguf_free(ctx);
      return -1;
    }
  }

  XXH64_hash_t const hash = XXH64_digest(xxh64_model_hash_state);

  XXH64_freeState(xxh64_model_hash_state);

  ggml_free(ctx_data);
  gguf_free(ctx);

  return hash;
}
