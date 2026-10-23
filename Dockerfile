FROM node:26-bookworm AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends emscripten \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/game/package.json ./packages/game/
RUN npm install
COPY . .

FROM deps AS game-deps
WORKDIR /workspace/packages/game
