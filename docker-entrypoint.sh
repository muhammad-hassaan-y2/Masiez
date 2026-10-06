#!/bin/sh
set -e

echo "================================================================"
echo "    Masiez Autonomous Drone Simulation - Container Starting    "
echo "================================================================"

# Start Backend Server on port 3001
echo "[1/2] Starting Backend Server (WebSocket + REST API on port 3001)..."
node /app/server/dist/index.js &
SERVER_PID=$!

# Start Game Client on port 5173
echo "[2/2] Starting Game Web Client (Vite on port 5173)..."
cd /app/game && npx vite preview --port 5173 --host 0.0.0.0 &
GAME_PID=$!

echo ""
echo "================================================================"
echo "  All simulation services are online and listening:"
echo "  -> Game Client (WebGPU):  http://localhost:5173"
echo "  -> Backend Server:        http://localhost:3001"
echo "  -> WebSocket Endpoint:    ws://localhost:3001/ws/game"
echo "================================================================"

# Handle termination signals gracefully
shutdown() {
    echo "Terminating services..."
    kill -TERM "$SERVER_PID" "$GAME_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    wait "$GAME_PID" 2>/dev/null || true
    echo "Services stopped."
    exit 0
}

trap shutdown SIGINT SIGTERM

# Wait for background processes
wait "$SERVER_PID" "$GAME_PID"
