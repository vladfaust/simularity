import runpod
from pydantic import ValidationError

from .core_wrapper import InferenceInputs, gpt_infer_stream


async def handler(job):
    print("Received job: ", job)

    try:
        parsed_input = InferenceInputs.model_validate(job["input"])
        generator = gpt_infer_stream(parsed_input)

        async for batch in generator:
            yield batch

    except ValidationError as e:
        yield {"error": e.errors()}

    except Exception as e:
        yield {"error": str(e)}


runpod.serverless.start({
    "handler": handler,
    "return_aggregate_stream": True
})
