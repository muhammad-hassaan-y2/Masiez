# Masiez — Autonomous Drone Simulation & Robotics Platform

Masiez is a real-time 3D drone simulation where FPV kamikaze drones hunt hostile targets in rendered battlefields. Perception and control run **inside the browser**: a trained RT-DETR detector finds targets in the drone's own camera view and a PPO policy flies the drone onto them. The whole autonomy stack ships as ONNX models executing on the game page — no AI servers required.

## Core Capabilities

- **Kamikaze FPV Simulation**: 6-DoF quadcopter flight with first-person and chase cameras, optical zoom, and target lock. Drones strike by flying directly into targets.
- **Multi-Drone Missions**: Each mission trades a limited drone fleet against a set of hostile tanks and soldiers; destroying a drone simply deploys the next.
- **In-Browser Autonomy**: Object detection and a learned following policy run on the game page. Toggle autonomy from the user menu (OFF / DETECT / FOLLOW) to watch the AI hunt on its own.
- **Kaggle Training Workflow**: Notebooks train the detector and the pursuit policy, then export compact models the browser loads directly. Drop them into the game and the HUD reports which engines are live.
- **Optional LiveKit Robotics Link**: For running models or controllers *outside* the browser, the drone can publish its FPV video, telemetry, and receive teleoperation over WebRTC, and notebooks can pilot it remotely. This is an alternative mode, off unless enabled.

## Quick Start

```bash
docker compose up --build
```

- Game: `http://localhost:5173` · JupyterLab: `http://localhost:8888`
- For the optional external-model mode: `docker compose --profile livekit up --build`

## Controls

| Input | Action |
| :--- | :--- |
| `` ` `` | User menu (levels, settings, AI autonomy, LiveKit link) |
| `W A S D` / Mouse | Steer and aim (click canvas for pointer lock) |
| `Shift` / `Ctrl` | Climb / descend |
| `Q` / `E` | Turn left / right |
| Direct impact | Detonate warhead |
| `Space` | Deploy next drone / restart mission |
| `V` / Right-click | Chase ↔ FPV / optical zoom |
| `T` | Lock target under reticle |

Any keyboard or mouse input instantly overrides the AI.

## Documentation

High-level design lives in the specifications: project overview, 3D world, drone API, AI agent, and user interface.
