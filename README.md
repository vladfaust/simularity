# Simularity

> Run interactive simulations locally, or in cloud.

This project aims to implement a foundation for self-hosted interactive simulation applications.

The closest description for the project right now is "AI-driven visual novels".

## Foundation

This project implements a base for future interactive simulation applications, presumably with application-specific modules and assets.

Ideally, a typical application workflow includes development of the assets only (such as scenarios, characters, images, UI elements etc.), so that all the foundation is re-used.

## Research 📚

### Token healing

- https://github.com/ahmed-moubtahij/TokenHealer (https://github.com/ggerganov/llama.cpp/issues/4778)
- https://github.com/ggerganov/llama.cpp/issues/5599

### Streaming LLM

A.k.a. Context Shifting.

Paper: https://github.com/mit-han-lab/streaming-llm.

- https://github.com/LostRuins/koboldcpp/issues/550
- https://github.com/ggerganov/llama.cpp/issues/3440
  - https://github.com/ggerganov/llama.cpp/blob/4399f13fb9462cd06f3f154d0aee738425000fea/examples/main/main.cpp#L542-L575

### Llama.cpp

- On KV cache size & sequences: https://github.com/ggerganov/llama.cpp/discussions/4130#discussioncomment-8053636
- https://www.youtube.com/watch?v=80bIUggRJf4 (contains math for KV cache size)
- https://blog.eleuther.ai/transformer-math/
- https://github.com/ggerganov/llama.cpp/pull/6412 (bfloat16)
- https://www.omrimallis.com/posts/understanding-how-llm-inference-works-with-llama-cpp
- https://kipp.ly/transformer-inference-arithmetic
- https://www.anyscale.com/blog/continuous-batching-llm-inference (vLLM)
- https://github.com/ggerganov/llama.cpp/discussions/7887, https://github.com/ggerganov/llama.cpp/pull/2054 (RoPE (extending context size))
- https://sidshome.wordpress.com/2023/12/24/understanding-internals-of-llama-cpp/

### Roleplay

- https://github.com/Neph0s/awesome-llm-role-playing-with-persona

### Training

- https://www.kaggle.com/code/aisuko/fine-tuning-t5-small-with-lora
- https://www.philschmid.de/fine-tune-flan-t5-peft
- https://towardsdatascience.com/training-t5-for-paraphrase-generation-ab3b5be151a2
- https://unsloth.ai/blog/llama3-1, https://colab.research.google.com/drive/1Ys44kVvmeZtnICzWz0xgpRnrIOjZAuxp (fine-tune on Google Colab)

### Serving

- https://lmsys.org/blog/2024-07-25-sglang-llama3/
