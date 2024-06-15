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

### June 2024

- [x] feat: inference server (Sat June 15)

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
