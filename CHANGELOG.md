# Simularity Changelog

## WIP 🚧

> Do not commit this section!

## Bugs 🐛

> After squashing, bugs are removed from this list.

- [ ] [SQLite Migrations Are not Applied](./issues/01-sqlite.md)

## MVP 🚀

- [x] feat: inference server

  - [ ] Payments

- [ ] tip: Looks like the AI is struggling to continue the conversation.
      Try rephrasing your message or add more possible destinations in it.

- [ ] feat: configure inference

  - Choose local files

    - [x] .gguf

  - [x] ~~Choose server~~
        You can only choose a Simularity Server.

  - Download files

    - [ ] Huggingface
    - [ ] Simularity CDN

- [ ] feat(client/SandboxConsole): set model parameters
      Temperature, top-K etc.

- [ ] feat(core): T5

  - [ ] feat: event labeling

    - [ ] feat: episode system
    - [ ] feat: quests

  - [ ] feat: summarization
  - [ ] feat: memory consolidation

- feat+dx: more GPT information

  - [ ] KV cache size (returns after decode/inference)
  - [ ] Memory usage (monitoring)

## Ideas 💡

- [x] feat: instruction-based interactions
      Simple text generation works fine once you understand the rules.

## History 📜

### August 2024

- [x] feat(client): choose scenario (Fri 2)
      Allows to load scenarios from a directory.
- [x] feat(client): updates' preferences for DPO (Wed 7)
- [x] feat(client): developer console with stage modifications

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
