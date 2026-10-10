# Vision microservice — uv-based Python image
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

FROM base AS runtime
COPY --from=deps /opt/venv /opt/venv
COPY . .

EXPOSE 8000
CMD ["python", "server.py"]
