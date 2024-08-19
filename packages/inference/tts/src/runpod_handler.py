import os
from typing import List

from pydantic import ValidationError
import runpod
from runpod.serverless.utils.rp_validator import validate

from .core import Core, TTSInputs

model_name = os.getenv("MODEL_NAME")
if model_name is None:
    raise ValueError("MODEL_NAME environment variable is not set")


core_instance = Core("1", model_name)


def handler(job):
    try:
        parsed_input = TTSInputs.model_validate(job["input"])

        result = core_instance.predict_speech(parsed_input, True)
        if not isinstance(result.wav, str):
            raise ValueError("Expected output.wav to be a string")

        return {
            "wav_base64": result.wav,
        }
    except ValidationError as e:
        return {"error": e.errors()}
    except Exception as e:
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
