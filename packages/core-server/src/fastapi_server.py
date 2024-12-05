from fastapi.applications import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .core_wrapper import InferenceInputs, gpt_infer, gpt_infer_stream

app = FastAPI(
    title="Simularity Core",
    description="""Simularity Core Inference Server""",
    version="0.1.0",
    docs_url="/",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="http://(localhost|127.0.0.1|0.0.0.0):\\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/infer")
def infer(parsed_input: InferenceInputs):
    return JSONResponse(content=jsonable_encoder(gpt_infer(parsed_input)))


@app.post("/infer_stream")
def infer_stream(parsed_input: InferenceInputs):
    return StreamingResponse(
        gpt_infer_stream(parsed_input),
        media_type="application/json",
    )
