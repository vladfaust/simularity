# Simularity Core Lib

Core library for Simularity, embedded in the [Tauri](../tauri/README.md) and [HTTP server](../server/README.md) modules.

## Features

- GPT for text generation.
- T5 for text-to-text generation:
  - `text2ssml` to convert prose to SSML.
  - `text2code` to convert prose to Lua code.
- [Bark](https://github.com/suno-ai/bark) for TTS.

## Technology

- https://github.com/huggingface/candle for GPT and T5.
- Probably https://github.com/PABannier/bark.cpp (FFI) for Bark.
