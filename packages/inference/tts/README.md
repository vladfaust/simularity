# XTTS

## Run locally

```sh
pipenv install
pipenv run uvicorn src/fastapi:app --port 9090
```

```sh
# Clone speaker.
curl -X POST -F "file=@/path/to/file.wav" http://localhost:9090/speaker -o /path/to/speaker.json
```

## Build image

```sh
# Run this command on the client for remote building.
DOCKER_HOST=ssh://user@host docker build -f Dockerfile.cuda -t simularity/tts:latest .
```
