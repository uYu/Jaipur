#!/bin/sh
set -eu

EM_CACHE="${EM_CACHE:-/private/tmp/jaipur-emscripten-cache}"
export EM_CACHE

em++ cpp/jaipur_ai.cpp \
  -O3 \
  -std=c++20 \
  -msimd128 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=worker \
  -sSINGLE_FILE=1 \
  -sFILESYSTEM=0 \
  -sALLOW_MEMORY_GROWTH=1 \
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_jaipur_choose','_jaipur_choose_neural','_jaipur_choose_timed','_jaipur_choose_neural_timed','_jaipur_choose_original']" \
  "-sEXPORTED_RUNTIME_METHODS=['HEAP32']" \
  -o src/game/wasm/jaipur_ai.mjs
