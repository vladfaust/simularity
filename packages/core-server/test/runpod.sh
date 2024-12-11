#!/bin/bash

# Runpod test script for TTS.
# It will actually run the model on the input data and return the output.
#
# Usage from root dir: MODEL_ID= MODEL_PATH= ./test/runpod.sh
#

set -e

test_input=$(cat ./test/runpod_test_input.json)
echo "Input data: $test_input"

pipenv run python -m src.runpod_handler --test_input "$test_input"
