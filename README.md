# Masiez — Autonomous Drone Simulation & Robotics Platform

Masiez is an interactive 3D drone simulation and robotics platform where a simulated quadcopter operates as a connected robot over **LiveKit WebRTC**. Operators can fly the drone in real-time 3D environments or connect external Python/Jupyter agents directly to the drone's video and telemetry streams for autonomous control and **Kaggle** model training.

---

## Core Capabilities

- **3D Drone Simulation**: Real-time 6-DoF quadcopter flight with First-Person View (FPV) and Chase cameras, optical zoom, and target lock.
- **Battlefield Environments**: Multiple selectable levels populated with autonomous **Soldiers** and **Tanks** (represented as clean geometric box placeholders ready for custom 3D assets). No civilian pedestrians are used.
- **User Menu (`Backquote` `` ` ``)**: Toggleable in-game settings menu (`~` / `` ` ``) providing access to sound/audio settings, flight speed profiles, camera modes, LiveKit robot status, and level switching. Levels are changed exclusively via the User Menu rather than during active gameplay.
- **Direct LiveKit Robot Connection**: The drone acts as a LiveKit robot participant (`room="drone"`), streaming WebRTC video and telemetry directly to subscribers without routing camera frames through a heavy backend server.
- **Jupyter & Kaggle Training Ready**: Connect directly from Jupyter notebooks to the drone via LiveKit to inspect live video frames, stream telemetry, issue teleoperation commands, and record datasets for training on Kaggle.

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
| **`` ` `` (Backquote)** | Toggle **User Menu** (Level Selection, Sound, Speed & Camera Settings) |
| **`W` / `S` / `A` / `D`** | Pitch forward/back & roll left/right |
| **`Shift` / `Ctrl`** | Climb / Descend |
| **`Q` / `E`** | Yaw heading left/right |
| **Mouse** | Pitch & yaw aiming (Click canvas to lock pointer) |
| **Left-Click / `F`** | Fire primary weapon |
| **Right-Click / `Z`** | Toggle optical scope |
| **`T` / Middle-Click** | Lock target under reticle |
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
