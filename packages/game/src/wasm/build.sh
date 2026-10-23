#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v emcc >/dev/null 2>&1; then
    echo "emcc not found. Install the Emscripten SDK and source emsdk_env.sh first." >&2
    exit 1
fi

emcc \
    main.cpp \
    DronePhysics.cpp \
    FlightController.cpp \
    Sensors.cpp \
    Collision.cpp \
    -O3 \
    -std=c++17 \
    --no-entry \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createPhysicsModule \
    -sEXPORTED_RUNTIME_METHODS='["setValue","getValue"]' \
    -sALLOW_MEMORY_GROWTH=1 \
    -o ../../public/assets/physics.js

echo "Built ../../public/assets/physics.js and physics.wasm"
