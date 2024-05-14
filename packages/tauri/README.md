# Simularity Tauri Module

This Rust module provides a [Tauri](https://tauri.app/)-based interface for Simularity applications, to be used in the [client](../client/README.md).

## Features

- [Core lib](../core/README.md) native integration.
- SQLite for data.
- Git for saves and branching.
- Lua for simulation scripting.

## Development

Tauri's `generate_context!` macro generates metadata for ALL files under the `build.distDir` directory.
If you have lots of files there, it will slow down the build process, and also `cargo check` / `cargo clippy`.
Therefore, you should keep the dist directory clean during development.
