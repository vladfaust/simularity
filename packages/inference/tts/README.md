# Simulairty TTS server

## Development

### Local FastAPI server

```sh
pipenv install
MODEL_NAME="tts_models/multilingual/multi-dataset/xtts_v2" \
  pipenv run uvicorn src.fastapi_server:app --port 9090
```

```sh
# Clone speaker.
curl -X POST \
  -F "file=@/path/to/file.wav" \
  -o /path/to/speaker.json \
  http://localhost:9090/v1/speaker
```

```sh
# TTS.
curl -X POST \
  -H "Content-Type: application/json" \
  -d "@/path/to/speaker.json" \
  -o "/path/to/tts.wav" \
  http://localhost:9090/v1/tts_raw
```

```sh
# Generate multiple TTSs.
node ./test/gen.mjs \
  http://127.0.0.1:9090/v1 \
  "/path/to/speaker.json" \
  ./test/test_inputs.local.json \
  "/path/to/output"
```

```sh
# Clone and generate TTSs, in one command.
node ./test/gen2.mjs \
  http://127.0.0.1:9090/v1 \
  "/path/to/voice.mp3" \
  ./test/test_inputs.local.json
```

### Runpod

```sh
# Run automated Runpod tests.
./test/runpod.sh
```

```sh
# Serve Runpod API locally.
# In the API's Runpod `tts_worker`, set `provider_external_id`
# to NULL or empty string, and set Runpod base URL to `http://localhost:8000`.
MODEL_NAME="tts_models/multilingual/multi-dataset/xtts_v2" \
  pipenv run python -m src.runpod_handler --rp_serve_api
```

```sh
# Run this command on the client for remote building.
DOCKER_HOST=ssh://user@host docker build \
  -f Dockerfile.runpod \
  --build-arg MODEL_NAME="tts_models/multilingual/multi-dataset/xtts_v2" \
  -t simularity/tts-runpod:latest .
```
