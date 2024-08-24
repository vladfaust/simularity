import os

from fastapi.applications import FastAPI
from fastapi.datastructures import UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from .core import Core, StreamingInputs, TTSInputs

model_name = os.getenv("MODEL_NAME")
if model_name is None:
    raise ValueError("MODEL_NAME environment variable is not set")


core = Core("1", model_name)

app = FastAPI(
    title="TTS Streaming server",
    description="""TTS Streaming server""",
    version="0.0.1",
    docs_url="/",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="http://(localhost|127.0.0.1|0.0.0.0):\\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# NOTE: This endpoint is for internal use only. 🤫
@app.post("/v1/speaker")
def create_speaker(file: UploadFile):
    """Create a speaker from an audio file, returning the embeddings JSON."""
    return core.create_speaker(file.file)


# NOTE: This endpoint is WIP. 🚧
@app.post("/v1/tts_stream")
def create_tts_stream(parsed_input: StreamingInputs):
    return StreamingResponse(
        core.predict_streaming_generator(parsed_input),
        media_type="audio/wav",
    )


class TtsResponseUsage(BaseModel):
    executionTime: int


class TtsResponseOutput(BaseModel):
    wavBase64: str


class TtsResponse(BaseModel):
    inferenceId: str
    usage: TtsResponseUsage
    output: TtsResponseOutput


@app.post("/v1/tts", status_code=201)
def create_tts(parsed_input: TTSInputs):
    """Create TTS audio from input."""

    output = core.predict_speech(parsed_input, True)
    if not isinstance(output.wav, str):
        raise ValueError("Expected output.wav to be a string")

    return JSONResponse(content=jsonable_encoder(TtsResponse(
        inferenceId=output.inference_id,
        usage=TtsResponseUsage(executionTime=output.usage.execution_time),
        output=TtsResponseOutput(wavBase64=output.wav),
    )))


@app.post("/v1/tts_raw", status_code=201)
def create_tts_raw(parsed_input: TTSInputs):
    """Create TTS audio from input."""

    output = core.predict_speech(parsed_input, False)
    if not isinstance(output.wav, bytes):
        raise ValueError("Expected output.wav to be bytes")

    return Response(content=output.wav, media_type="audio/wav")
