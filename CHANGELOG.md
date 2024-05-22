# Simularity Changelog

## WIP 🚧

> Do not commit this section!

## Bugs 🐛

> After squashing, bugs are removed from this list.

## MVP 🚀

- [ ] feat: instruction-based interactions

- [ ] feat: inference server

  - [ ] Payments

- [ ] feat: configure inference

  - [ ] Choose local files
  - [ ] Choose server
  - [ ] Download files

    - [ ] Huggingface
    - [ ] Custom CDN

- [ ] feat: event labeling
- [ ] feat: episode system
- [ ] feat: consolidation
- [ ] feat: quests

- [ ] refactor: rename llamaInferences -> gptInferences
- [ ] refactor: rename writerUpdates -> chatUpdates, directorUpdates -> stageUpdates

- [ ] dx: display current stage in console
- [ ] dx: save gpt inferences to DB

- [ ] feat+dx: more GPT information

  - [ ] KV cache size (returns after decode/inference)
  - [ ] Memory usage (monitoring)

## History 📜

### May 2024

- [x] feat: llama.cpp integration (Tue May 7, 2024)
- [x] feat: replace git w/ SQLite (Sat May 11, 2024)
- [x] feat: regenerate an update (Mon May 13, 2024)
- [x] feat: reuse GPTs by params & KV cache key (Wed May 15, 2024)
- [x] feat(client): sandbox console (Sun May 19, 2024)
- [x] feat(client): chat interface (Wed May 22, 2024)

### April 2024

- [x] feat: create new game (Sat April 27, 2024)

  - [x] ~~Create game Git repository (libgit2)~~
        (May 11, 2024) Git was removed in favor of SQLite.

  - [x] Render initial scene

    - [x] Read assets
    - [x] Run Lua scripts
    - [x] Render scene with Phaser
