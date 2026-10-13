# Masiez — Autonomous Drone Simulation & Robotics Platform

Masiez is an interactive 3D drone simulation and robotics platform where a simulated quadcopter operates as a connected robot over **LiveKit WebRTC**. Operators can fly the drone in real-time 3D environments or connect external Python/Jupyter agents directly to the drone's video and telemetry streams for autonomous control and **Kaggle** model training.

---

## Core Capabilities

- **Kamikaze FPV Drone Simulation**: Real-time 6-DoF quadcopter flight with First-Person View (FPV) and Chase cameras, optical zoom, and target lock. Rather than firing projectiles, each drone carries an onboard explosive warhead and performs kamikaze strikes by flying directly into hostile targets.
- **Multi-Drone Mission & Scoring System**: Each mission provides a fixed number of hostile targets (**Tanks** and **Soldiers**) and a limited fleet of FPV drones. Destroying a drone does not end the game—the operator automatically deploys the next drone from base until all targets are eliminated (**Victory**) or the drone fleet is exhausted (**Mission Failed**).
- **Battlefield Environments**: Multiple selectable levels populated with autonomous **Soldiers** and **Tanks** (represented as clean geometric box placeholders ready for custom 3D assets). No civilian pedestrians are used.
- **User Menu (`Backquote` `` ` ``)**: Toggleable in-game settings menu (`~` / `` ` ``) providing access to sound/audio settings, flight speed profiles, camera modes, mission reset, LiveKit robot status, and level switching. Levels are changed exclusively via the User Menu rather than during active gameplay.
- **Direct LiveKit Robotics Connection**: Following [LiveKit Robotics](https://docs.livekit.io/robotics/) patterns, the drone acts as a realtime WebRTC robot participant (`room="drone"`), streaming low-latency FPV video and data-channel telemetry/strike events directly to subscribers without routing frames through a heavy backend server.
- **Jupyter & Kaggle Training Ready**: Connect directly from Jupyter notebooks to the drone via LiveKit to inspect live video frames, monitor mission telemetry, issue teleoperation commands, and record datasets for training on Kaggle.

---

## Quick Start

### 1. Start the Platform (Docker)
```bash
docker compose up --build
```

- **3D Drone Simulator**: `http://localhost:5173`
- **LiveKit SFU Server**: `ws://localhost:7880`
- **JupyterLab**: `http://localhost:8888`

### 2. Controls

| Input | Action |
| :--- | :--- |
| **`` ` `` (Backquote)** | Toggle **User Menu** (Level Selection, Sound, Speed, Camera & Mission Reset) |
| **`W` / `S` / `A` / `D`** | Pitch forward/back & roll left/right |
| **`Shift` / `Ctrl`** | Climb / Descend |
| **`Q` / `E`** | Yaw heading left/right |
| **Mouse** | Pitch & yaw aiming (Click canvas to lock pointer) |
| **Direct Impact** | Detonate onboard kamikaze warhead against hostile target |
| **`Space`** | Deploy next FPV drone immediately after detonation (or restart finished mission) |
| **Right-Click / `Z`** | Toggle optical zoom |
| **`T` / Middle-Click** | Lock hostile target under reticle |
| **`V`** | Toggle FPV / Chase camera |
| **`M`** | Mute / Unmute audio |

---

## Specifications

High-level design goals are documented in the `specs/` directory:
- [Project Overview](specs/project-overview.md)
- [3D World](specs/3d-world.md)
- [Drone API & LiveKit Link](specs/drone-api.md)
- [AI Agent & Kaggle Workflow](specs/ai-agent.md)
- [User Interface & Menu](specs/user-interface.md)
