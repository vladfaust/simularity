import os

from pydantic import ValidationError
import runpod

from .core import Core, StreamingInputs

model_name = os.getenv("MODEL_NAME")
if model_name is None:
    raise ValueError("MODEL_NAME environment variable is not set")


# TODO: Multiple core instances.
core_instance = Core("1", model_name)


async def handler(job):
    try:
        parsed_input = StreamingInputs.model_validate(job["input"])

        generator = core_instance.predict_streaming_generator(
            parsed_input, True, True)

        async for batch in generator:
            yield batch

    except ValidationError as e:
        yield {"error": e.errors()}

    except Exception as e:
        yield {"error": str(e)}


runpod.serverless.start({
    "handler": handler,
})
