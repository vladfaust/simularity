import os
import sys

from TTS.utils.generic_utils import get_user_data_dir
from TTS.utils.manage import ModelManager


def download_model(model_name: str):
    model_path = os.path.join(get_user_data_dir(
        "tts"), model_name.replace("/", "--"))
    print("Downloading TTS model...", model_path, flush=True)
    ModelManager().download_model(model_name)
    return model_path


if __name__ == "__main__":
    # Get model name as the first argument
    model_name = sys.argv[1]
    if model_name is None:
        print("Please provide a model name as an argument")
        sys.exit(1)

    model_path = download_model(model_name)
    print(f"Model downloaded to {model_path}")
