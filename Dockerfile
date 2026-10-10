FROM node:20-debian AS base
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY game/package.json ./game/
COPY server/package.json ./server/
RUN npm install
COPY . .

FROM deps AS game-deps
WORKDIR /workspace/game

FROM deps AS server-deps
WORKDIR /workspace/server
