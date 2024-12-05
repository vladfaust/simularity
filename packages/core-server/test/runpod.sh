#!/bin/bash

# Runpod test script for TTS.
# It will actually run the model on the input data and return the output.
#
# Usage from root dir: ./test/runpod.sh
#

set -e

test_input=$(cat ./test/runpod_test_input.json)
# Print the input data
echo "Input data: $test_input"
MODEL_ID="kunoichi-7b" \
MODEL_PATH="/Users/vladfaust/Library/Application Support/ai.simularity.dev/models/writer/kunoicihi-7b.q4km.gguf" \
  pipenv run python -m src.runpod_handler --test_input "$test_input"
