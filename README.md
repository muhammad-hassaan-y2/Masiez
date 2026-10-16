# Masiez — Autonomous Drone Simulation

## Development with Docker

### 1. Map local hostnames

Add to your `hosts` file (`/etc/hosts` on Linux/macOS, `C:\Windows\System32\drivers\etc\hosts` on Windows):

```text
127.0.0.1 game.local
127.0.0.1 jupyter.local
```

### 2. Generate local certificates

```bash
npm run gen:certs
```

Trust `certs/ca.crt` in your system or browser store once so both URLs open without warnings.

### 3. Start the stack

```bash
docker compose up --build
```

- **Simulator & HUD**: https://game.local:8443

Edits hot-reload — no rebuild needed while iterating.

Optional: add `-f docker-compose.livekit.yml` to include LiveKit and JupyterLab (https://jupyter.local:8443).

### Stop

```bash
docker compose down
```

## Specs

High-level design lives in [`specs/`](specs/).
