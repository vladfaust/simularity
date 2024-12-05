import asyncio
import json
import os
import threading
from enum import Enum
from typing import List

import simularity_core_server
from pydantic import BaseModel

model_id = os.getenv("MODEL_ID")
model_path = os.getenv("MODEL_PATH")

context_size = None
if os.getenv("CONTEXT_SIZE"):
    context_size = int(os.getenv("CONTEXT_SIZE"))

initial_prompt = os.getenv("INITIAL_PROMPT") or None
state_file_path = os.getenv("STATE_FILE_PATH") or None

simularity_core_server.init()
simularity_core_server.model_load(model_path, model_id)


class Dynatemp(BaseModel):
    range: float = None
    exponent: float = None


class Penalty(BaseModel):
    last_n: int = None
    repeat: float = None
    freq: float = None
    present: float = None
    penalize_nl: bool = None


class MirostatVersion(str, Enum):
    V1 = "v1"
    V2 = "v2"


class Mirostat(BaseModel):
    version: MirostatVersion
    tau: float = None
    eta: float = None


class InferenceOptions(BaseModel):
    n_prev: int = None
    n_probs: int = None
    min_keep: int = None
    top_k: int = None
    top_p: float = None
    min_p: float = None
    tfs_z: float = None
    typical_p: float = None
    temp: float = None
    dynatemp: Dynatemp = None
    penalty: Penalty = None
    mirostat: Mirostat = None
    seed: int = None
    grammar: str = None
    stop_sequences: List[str] = None
    lua_grammar: str = None


class InferenceInputs(BaseModel):
    session_id: int = None
    prompt: str
    n_eval: int
    options: InferenceOptions = None


class InferenceResult(BaseModel):
    session_id: int
    input_length: int
    result: str
    context_length: int


def convert_inference_options(options: InferenceOptions) -> simularity_core_server.InferenceOptions:
    return simularity_core_server.InferenceOptions(
        n_prev=options.n_prev,
        n_probs=options.n_probs,
        min_keep=options.min_keep,
        top_k=options.top_k,
        top_p=options.top_p,
        min_p=options.min_p,
        tfs_z=options.tfs_z,
        typical_p=options.typical_p,
        temp=options.temp,
        dynatemp=simularity_core_server.Dynatemp(
            range=options.dynatemp.range,
            exponent=options.dynatemp.exponent
        ) if options.dynatemp else None,
        penalty=simularity_core_server.Penalty(
            last_n=options.penalty.last_n,
            repeat=options.penalty.repeat,
            freq=options.penalty.freq,
            present=options.penalty.present,
            penalize_nl=options.penalty.penalize_nl
        ) if options.penalty else None,
        mirostat=simularity_core_server.Mirostat(
            version=options.mirostat.version,
            tau=options.mirostat.tau,
            eta=options.mirostat.eta
        ) if options.mirostat else None,
        seed=options.seed,
        grammar=options.grammar,
        stop_sequences=options.stop_sequences,
        lua_grammar=options.lua_grammar
    )


def get_gpt_session_id(provided_session_id):
    if (provided_session_id and
            simularity_core_server.gpt_touch(provided_session_id)):
        return provided_session_id

    return simularity_core_server.gpt_create(
        model_id,
        context_size,
        initial_prompt=initial_prompt,
        state_file_path=state_file_path)


def gpt_infer(parsed_input: InferenceInputs) -> InferenceResult:
    gpt_session_id = get_gpt_session_id(parsed_input.session_id)

    input_length = simularity_core_server.gpt_token_length(
        model_id, parsed_input.prompt)

    ret = simularity_core_server.gpt_infer(
        gpt_session_id,
        parsed_input.n_eval,
        parsed_input.prompt,
        options=convert_inference_options(parsed_input.options) if parsed_input.options else None)

    return InferenceResult(
        session_id=gpt_session_id,
        input_length=input_length,
        result=ret.result,
        context_length=ret.context_length)


async def gpt_infer_stream(parsed_input: InferenceInputs):
    gpt_session_id = get_gpt_session_id(parsed_input.session_id)

    input_length = simularity_core_server.gpt_token_length(
        model_id, parsed_input.prompt)

    queue = asyncio.Queue()
    result_queue = asyncio.Queue()

    def callback(tokens):
        queue.put_nowait({"tokens": tokens})
        return True

    def wrapped_f(result_queue, *args, **kwargs):
        ret = simularity_core_server.gpt_infer(*args, **kwargs)
        result_queue.put_nowait(ret)

    # Run a thread to run the GPT inference.
    inference_thread = threading.Thread(
        target=wrapped_f,
        args=[
            result_queue,
            gpt_session_id,
            parsed_input.n_eval,
            parsed_input.prompt,
            convert_inference_options(
                parsed_input.options) if parsed_input.options else None,
            callback
        ])
    inference_thread.start()

    # Run another thread to check if `inference_thread` is completed.
    def check_thread_fn():
        try:
            inference_thread.join()
            queue.put_nowait(None)
        except Exception as e:
            queue.put_nowait({"error": e})

    check_thread = threading.Thread(target=check_thread_fn)
    check_thread.start()

    while True:
        # Wait until data is available.
        value = await queue.get()

        # Check for termination signal.
        if value is None:
            context_length = result_queue.get_nowait().context_length

            # Send `{"done": true, "context_length": ...}`.
            yield json.dumps({
                "done": True,
                "session_id": gpt_session_id,
                "input_length": input_length,
                "context_length": context_length
            }, separators=(',', ':')) + "\n"

            break

        elif "error" in value:
            raise value["error"]

        else:
            # Send `{"done": false, "tokens": "..." }`.
            yield json.dumps({
                "done": False,
                "tokens": value["tokens"]
            }, separators=(',', ':')) + "\n"
