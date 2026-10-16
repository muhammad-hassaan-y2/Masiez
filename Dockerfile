FROM node:26-bookworm AS base
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/game/package.json ./packages/game/
RUN npm install
COPY . .

FROM deps AS game-deps
WORKDIR /workspace/packages/game
