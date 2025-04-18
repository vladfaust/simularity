# Simularity Changelog

## History 📜

### December 2024

- [x] feat(infra): core-server (Fri 6)
      Required for LuaGBNF cloud inference.

### November 2024

- [x] feat: unified writer & director agent, dynamic Lua GBNF grammar (Fri 29)

### October 2024

- [x] epic: migrate to tRPC (Thu 3)
- [x] feat: remote scenarios (Fri 4)
- [x] feat: i18n (Mon 7)
- [x] feat: upgrade to tauri v2 (Thu 17)
- [x] feat: download releases (Tue 22)

### September 2024

- [x] feat: credits (Tue 3)
- [x] MVP release! (Tue 10) 🚀
- [x] feat: download models (Wed 18)
- [x] feat: new UI (click to choose scenario) (Thu 26)
- [x] feat: build on Windows (Mon 30)

### August 2024

- [x] feat(client): choose scenario (Fri 2)
      Allows to load scenarios from a directory.
- [x] feat(client): updates' preferences for DPO (Wed 7)
- [x] feat(client): developer console with stage modifications (Wed 7)
- [x] feat(client): scene ambiences (Thu 8)
- [x] feat(client): simulation clock (Thu 8)
      Tick-tock, tick-tock.
- [x] feat: Runpod inference (Mon 12)
      Crude, but it works. Uses vLLM.
- [x] feat: store LLM completions locally (Wed 14)
- [x] feat: cloud TTS w/ Runpod (Sun 18)
- [x] feat(client): working director agent (Tue 20)

### July 2024

- [x] feat: C++ core (Tue 9)
      Drops the llama-cpp-rs crate dependency.
      Allows to use Whisper, Bark and other GGML-based models.
      Improved state loading speed, unlocked flash attention.
      Reuses management code among Tauri and Inference Server.
- [x] feat: whole prompts in GPT (Thu 19)
      Simplifies logic in exchange for more wire usage (feasable, though).
- [x] feat(client): turn-based roleplay chat game (Fri 20)
- [x] feat(client): summarization (Tue 23)
      Instead of T5, use the same GPT to reuse prompt.
- [x] feat(client): better simulation navigation (Sun 28)
      Jump to, edit and regenerate any update, not just the latest one.

### June 2024

- [x] feat: inference server (Sat June 15)
- [x] feat: GPT session caching (Wed June 19)
- [x] feat: streaming inference (Sun June 23)
- [x] feat: streaming progress reporting (Thu June 27)
- [x] feat: abort inference (Sat June 29)

### May 2024

- [x] feat: llama.cpp integration (Tue May 7, 2024)
- [x] feat: replace git w/ SQLite (Sat May 11, 2024)
- [x] feat: regenerate an update (Mon May 13, 2024)
- [x] feat: reuse GPTs by params & KV cache key (Wed May 15, 2024)
- [x] feat(client): sandbox console (Sun May 19, 2024)
- [x] feat(client): chat interface (Wed May 22, 2024)
- [x] feat(client): edit user messages (Mon May 27, 2024)
- [x] feat(client): instruct mode (Wed May 29, 2024)

### April 2024

- [x] feat: create new game (Sat April 27, 2024)

  - [x] ~~Create game Git repository (libgit2)~~
        (May 11, 2024) Git was removed in favor of SQLite.

  - [x] Render initial scene

    - [x] Read assets
    - [x] Run Lua scripts
    - [x] Render scene with Phaser
