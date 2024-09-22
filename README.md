# Simularity

This repository contains mathematical proof of simulated reality (_simularity_).

The project can run locally (currently MacOS M-series chips only).
Alternatively, cloud inference is available at [simularity.ai](https://simularity.ai).

## Demo 🚀

Click to play a YouTube video:

[![Simularity Chat Mode Demo](https://img.youtube.com/vi/CFIA9X39cUA/0.jpg)](https://www.youtube.com/watch?v=CFIA9X39cUA)

[![Simularity Visual Novel Demo](https://img.youtube.com/vi/iIuxUJkCPgU/0.jpg)](https://www.youtube.com/watch?v=iIuxUJkCPgU)

## Deployment 🚢

### Quick Start

Run development web server:

```sh
cd packages/client
npm run dev
```

Run the Tauri application:

```sh
cd packages/tauri
cargo tauri dev
```

Simularity depends on scenarios.
Download example scenarios from the [simularity-scenarios](https://github.com/vladfaust/simularity-scenarios) repository and place them into the `/Users/user/Library/Application Support/ai.simularity.dev/scenarios` directory.

### Dokku

See [packages/api/README.md](./packages/api/README.md) and [packages/web/README.md](./packages/web/README.md) for Dokku deployment instructions.

### CI

#### Windows Host on Hetzner

1. Use https://docs.hetzner.com/cloud/servers/windows-on-cloud/#example-instructions to install Windows Server 2022 Standard:

   1. Rent an Ubuntu server.
   2. Mount `Windows Server 2022 English` ISO, reboot the server, connect via Hetzner console.
   3. Proceed with the installation.
   4. When at the disks page, mount `virtio-win-0.1.248.iso`, install drivers:

      1. `Baloon/2k22/amd64`,
      2. `NetKVM/2k22/amd64`,
      3. `vioscsi/2k22/amd64`.

   5. Switch back to the Windows Server 2022 ISO.
   6. Remove all disk partitions, create a new one.

2. Connect via Remote Desktop.
3. These are the variable you'll need to set: `$buildkiteAgentToken`, `$sshKeyUser`, `$userPassword`.
4. Download VS Build Tools and install the following:

   1. MSVC,
   2. Windows SDK,
   3. CMake,
   4. Windows Universal CRT SDK (from individual components).

   ```powershell
   $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest https://aka.ms/vs/17/release.ltsc.17.10/vs_buildtools.exe -OutFile ~\Downloads\vs_BuildTools.exe; ~\Downloads\vs_buildtools.exe `
     --quiet --wait --includeRecommended `
     --add Microsoft.VisualStudio.Workload.VCTools `
     --add Microsoft.Component.VC.Runtime.UCRTSDK `
     --add Microsoft.VisualStudio.Component.VC.CMake.Project
   ```

5. Download and install Cuda with `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri "https://developer.download.nvidia.com/compute/cuda/12.6.1/network_installers/cuda_12.6.1_windows_network.exe" -OutFile ~\Downloads\cuda_12.6.1_windows_network.exe; ~\Downloads\cuda_12.6.1_windows_network.exe -s`.
   See https://www.server-world.info/en/note?os=Windows_Server_2022&p=cuda.

6. After CUDA is installed, copy some extensions: `cp "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\extras\visual_studio_integration\MSBuildExtensions\*" "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\"` (see https://stackoverflow.com/questions/56636714/cuda-compile-problems-on-windows-cmake-error-no-cuda-toolset-found).

7. Install Scoop with `iex "& {$(irm get.scoop.sh)} -RunAsAdmin"`.
8. Install Git with `scoop install git`.
9. Run `git config --system core.longpaths true` (https://stackoverflow.com/questions/22041752/github-clone-succeeded-but-checkout-failed).
10. Download RustUp with `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile ~\Downloads\rustup.exe`.
11. Install Rust toolchain with `~\Downloads\rustup.exe default stable`.
12. Add Rust to Path (temporarily) with `$env:Path += ";C:\Users\Administrator\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;C:\Users\Administrator\.cargo\bin"`.
13. Install Tauri CLI globally with `cargo install tauri-cli`.
14. Install Ninja with `scoop install ninja`.
15. Install CCache with `scoop install ccache`.
16. Install Buildkite agent with https://buildkite.com/docs/agent/v3/windows:

    ```powershell
    $env:buildkiteAgentToken = $buildkiteAgentToken
    Set-ExecutionPolicy Bypass -Scope Process -Force
    iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/buildkite/agent/main/install.ps1'))
    ```

17. Generate SSH key with: `ssh-keygen -t rsa -b 4096 -C $sshKeyUser`.
    This key shall be added to the Git repository.
18. Install Nano with `scoop install nano`.

19. Edit Buildkite config with `nano C:\buildkite-agent\buildkite-agent.cfg`:

    1. Set tags to `tags="queue=buildkite-agent-windows"`.
    2. Enable PowerShell with new line: `shell="C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"`.

20. Install NSSM:

    ```powershell
    scoop install nssm
    nssm install buildkite-agent "C:\buildkite-agent\bin\buildkite-agent.exe" "start"
    nssm set buildkite-agent AppStdout "C:\buildkite-agent\buildkite-agent.log"
    nssm set buildkite-agent AppStderr "C:\buildkite-agent\buildkite-agent.log"
    nssm set buildkite-agent ObjectName "$Env:ComputerName\$Env:UserName" "$userPassword"
    ```

21. Install NodeJS with `scoop install nodejs-lts`.

## History 📜

My previous simulation project, [aistories](https://github.com/vladfaust/aistories), was dependent on third-party AI providers.
This project is a self-contained simulation engine which can run locally thanks to Llama.cpp.

## Marketing Ideas 📈

- https://youtu.be/Kbk9BiPhm7o?si=8xfqeHy6H59Cyf7X&t=780 (on how digital compute works to satisfy the limbic system).
- Speedrun on romancing a character.

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
- https://x.com/rohanpaul_ai/status/1827174171165499769 (Whisper + HQQ (Half-Quadratic Quantization)), https://github.com/huggingface/distil-whisper
- https://docs.vllm.ai/en/stable/getting_started/examples/tensorize_vllm_model.html
- https://x.com/reach_vb/status/1828892506320159172, https://github.com/huggingface/huggingface-llama-recipes/blob/main/torch_compile_with_torchao.ipynb (transformers + torchao = 🔥)
- https://quickaitutorial.com/five-technique-vllm-torch-flash_attention-super-local-llm/ (Flash Attention in vLLM)
