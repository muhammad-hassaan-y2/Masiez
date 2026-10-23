# Masiez — Project Specification

## Vision
Masiez is a real-time 3D drone simulation where the drone is a trainable autonomous robot. The complete perceive-and-fly loop runs inside the game page: the drone's own camera image feeds an in-browser detector, and the detections drive a pursuit policy that steers the aircraft. A single browser page is therefore a working robotics platform.

## Core Principles
- **Autonomy in the browser.** Perception and flight policy execute locally against the drone's camera image. The default experience needs no external services.
- **Simple by default.** No streaming infrastructure, model servers, or supporting containers are required to run or extend the simulation.
- **Human takes priority.** Autonomy assists the operator and yields immediately to manual input.
- **Focused battlefield.** Scenarios contain only hostile and allied soldiers and tanks, keeping the visual vocabulary small and trainable.
- **Creative freedom.** This document describes outcomes and constraints, not implementation details.

## Gameplay
- The operator flies a quadcopter across multiple selectable environments, including an airfield, urban sectors, and open terrain.
- Enemies are soldiers and tanks rendered as simple boxes.
- The drone carries a warhead instead of projectiles; a target is destroyed by flying into it.
- Each mission pairs a target count with a limited fleet of replacement drones. The mission ends when all targets are destroyed or the fleet is exhausted.
- Terrain and structures are solid. Impacting anything at speed detonates the drone.

## Flight & Control
- **FPV** is the primary view, gimbal-stabilized and identical to what the AI sees. **Chase** view provides third-person spatial awareness.
- Flight profiles range from stable cruise to aggressive turbo.
- Commands are validated against operational state such as arming and emergency stop before execution.
- Any manual input overrides autonomy instantly; autonomy resumes when input stops.

## In-Browser AI
- **Detector** locates hostile targets in the FPV image and reports their screen position and apparent size.
- **Pursuit policy** consumes the selected target's image-space position and size plus the drone's velocity, and outputs velocity commands rewarded for closing the distance.
- Autonomy is operator-controlled with modes **OFF**, **DETECT**, and **FOLLOW**.
- The AI layer is always visible: detected bounding boxes, mode, target-seeking state, and inference cost.
- Until trained weights are deployed, clearly labeled built-in substitutes let the full pipeline run at any time.

## Training Workflow
- Models are trained externally on **Kaggle** using notebooks that reproduce the game's visual and flight conditions.
- Exported models target the browser runtime with a fixed, documented input/output contract; a verification step in each notebook proves the contract holds.
- Training notebooks live in `packages/notebooks` and can also generate synthetic or recorded datasets.

## User Interface
The interface is intentionally minimal. Detail is added gradually, and only when it proves useful.

- **Flight readouts**: altitude, speed, heading, battery, armed state.
- **Mission line**: targets destroyed versus total, drones remaining, score.
- **Crosshair**: simple fixed reticle with lock and hit feedback.
- **AI status**: current mode and detection or pursuit state.
- **Menu**: opened with Esc (backquote also works). Contains level selection, AI mode, camera view, speed profile, audio, and mission restart. Levels change only here.

The operator can always tell at a glance who is flying the drone and which AI models back it.

## Project Structure
- `packages/game` — simulator, physics integration, rendering, HUD, and in-browser AI.
- `packages/game/wasm` — C++ flight, sensor, and collision simulation compiled to WebAssembly.
- `packages/notebooks` — Kaggle training notebooks for the detector and pursuit policy.
