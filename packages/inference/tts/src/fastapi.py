from fastapi.responses import Response, StreamingResponse
from fastapi.applications import FastAPI
from fastapi.datastructures import UploadFile
from fastapi.middleware.cors import CORSMiddleware
from . import core

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


@app.post("/speaker")
def create_speaker(wav_file: UploadFile):
    """Create speaker from wav file"""

    file = wav_file.file

    try:
        return core.create_speaker(file)
    except RuntimeError as e:
        return {"error": str(e)}


@app.post("/tts_stream")
def create_tts_stream(parsed_input: core.StreamingInputs):
    return StreamingResponse(
        core.predict_streaming_generator(parsed_input),
        media_type="audio/wav",
    )


@app.post("/tts")
def create_tts(parsed_input: core.TTSInputs):
    wav_bytes = core.predict_speech(parsed_input)
    return Response(content=wav_bytes, media_type="audio/wav")


@app.get("/languages")
def get_languages():
    return core.get_languages()
