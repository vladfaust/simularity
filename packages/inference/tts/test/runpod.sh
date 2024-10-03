#!/bin/bash

# Runpod test script for TTS.
# It will actually run the model on the input data and return the output.
#
# Usage from root dir: ./test/runpod.sh
#

set -e

test_input=$(cat test/runpod_test_input.json)
MODEL_NAME="tts_models/multilingual/multi-dataset/xtts_v2" \
  pipenv run python -m src.runpod_handler --test_input "$test_input" --rp_api_concurrency 2
