# Simularity Core Inference Server

## Current state

RunPod log:

```plaintext
2024-12-05T10:02:31.946735413Z ==========
2024-12-05T10:02:31.946742913Z == CUDA ==
2024-12-05T10:02:31.946748503Z ==========
2024-12-05T10:02:31.951653877Z CUDA Version 12.6.3
2024-12-05T10:02:31.954155555Z Container image Copyright (c) 2016-2023, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
2024-12-05T10:02:31.955984245Z This container image and its contents are governed by the NVIDIA Deep Learning Container License.
2024-12-05T10:02:31.955990395Z By pulling and using the container, you accept the terms and conditions of this license:
2024-12-05T10:02:31.955995695Z https://developer.nvidia.com/ngc/nvidia-deep-learning-container-license
2024-12-05T10:02:31.956008485Z A copy of this license is made available in this container at /NGC-DL-CONTAINER-LICENSE for your convenience.
2024-12-05T10:02:34.311500804Z [10:02:34.311] [libsimularity] [info] Initialized
2024-12-05T10:02:34.311530675Z [10:02:34.311] [libsimularity] [info] AVX = 1 | AVX_VNNI = 0 | AVX2 = 1 | AVX512 = 1 | AVX512_VBMI = 0 | AVX512_VNNI = 0 | AVX512_BF16 = 0 | FMA = 1 | NEON = 0 | SVE = 0 | ARM_FMA = 0 | F16C = 1 | FP16_VA = 0 | WASM_SIMD = 0 | BLAS = 1 | SSE3 = 1 | SSSE3 = 1 | VSX = 0 | MATMUL_INT8 = 0 | LLAMAFILE = 0 |
2024-12-05T10:02:34.311536795Z [10:02:34.311] [libsimularity] [debug] simularity_model_load(model_path: /runpod-volume/models/kunoichi-7b.Q5_K_M.gguf, model_id: kunoichi-7b, progress_callback: <None>)
2024-12-05T10:02:34.311542945Z [10:02:34.311] [libsimularity] [debug] Acquiring models lock
2024-12-05T10:02:34.311548115Z [10:02:34.311] [libsimularity] [debug] Checking model: kunoichi-7b
2024-12-05T10:02:34.311553725Z [10:02:34.311] [libsimularity] [debug] Loading model: /runpod-volume/models/kunoichi-7b.Q5_K_M.gguf
<Crashes with exit code 132 (illegal instruction)>
```

Crashes while calling `llama_load_model_from_file`.
See https://github.com/ggerganov/llama.cpp/issues/537, https://github.com/abetlen/llama-cpp-python/issues/272, https://github.com/abetlen/llama-cpp-python/issues/284, https://github.com/ollama/ollama/issues/644, https://github.com/TabbyML/tabby/issues/856.
Yet AVX may be a red herring, and there is problem with CUDA, or model file?

## Development

```sh
pipenv install
maturin develop
```

### FastAPI

```sh
pipenv install --categories "packages,fastapi"
\
  MODEL_ID="🚨MODEL_ID🚨" \
  MODEL_PATH="/path/to/model.gguf" \
  CONTEXT_SIZE=8192 \
  pipenv run uvicorn src.fastapi_server:app --port 9090
```

```sh
# Infer.
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Tell me about yourself.", "n_eval": 16, "options": {"temp": 0.1}}' \
  http://localhost:9090/infer

# Infer (stream).
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Tell me about yourself.", "n_eval": 16, "options": {"temp": 0.1}}' \
  http://localhost:9090/infer_stream
```

### RunPod

Run server locally:

```sh
MODEL_ID="🚨MODEL_ID🚨" \
  MODEL_PATH="/path/to/model.gguf" \
  pipenv run python -m src.runpod_handler --rp_serve_api --rp_api_port 8080
```

Run endpoint tests:

```sh
MODEL_ID="🚨MODEL_ID🚨" \
  MODEL_PATH="/path/to/model.gguf" \
  ./test/runpod.sh
```
