# ============================================================
# Dockerfile for Masiez Autonomous Drone Simulation
# Encapsulates C++ WebAssembly physics, WebGPU game frontend,
# and Node.js WebSocket & REST backend into a unified container.
# ============================================================

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HTTP_PORT=3001

# Copy workspace package definitions for optimal Docker layer caching
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY game/package.json ./game/
COPY server/package.json ./server/

# Install workspace dependencies
RUN npm install

# Copy complete project source code and assets
COPY . .

# Build all workspace packages (shared types, game client, and backend server)
RUN npm run build

# Make entrypoint script executable
RUN chmod +x /app/docker-entrypoint.sh

# Expose required ports:
# 5173 - WebGPU Drone Simulation Game Client
# 3001 - Backend Game Server (WebSocket + REST API)
EXPOSE 5173 3001

# Launch both frontend and backend services
ENTRYPOINT ["/app/docker-entrypoint.sh"]
