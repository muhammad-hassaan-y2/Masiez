# Masiez — Project Specification

## Vision
Masiez is a real-time 3D drone simulation that runs inside a single browser page. The operator flies an FPV quadcopter over a tank battlefield, either manually or by selecting a tank and letting the drone fly into it. Because the simulation knows every tank transform, it can label its own camera frames with exact boxes and export them as training data for a pixel-only tank detector.

## Core Principles
- **Autonomy in the browser.** Rendering, physics, flight assistance, and data capture run locally. No model servers or supporting containers are required.
- **Simple by default.** One battlefield, one target class, and direct controls keep the experience and the training data focused.
- **Human takes priority.** Any manual flight input cancels the autopilot immediately.
- **Ground truth by construction.** Training labels come from the simulation's own geometry, so they are pixel-accurate and need no manual annotation.
- **Focused battlefield.** Targets are tanks with a small, consistent visual vocabulary that is practical to train on.

## Gameplay
- The battlefield is open terrain populated with tanks.
- The drone carries a warhead instead of projectiles; a tank is destroyed by flying into it.
- Any high-speed impact detonates the drone and destroys tanks inside the blast radius.
- A lost drone shows a signal-loss screen and is replaced after a short delay.
- The map is cleared when every tank is destroyed; Space redeploys a fresh battlefield.
- Opening the user menu or clearing the map freezes the simulation, flight timer, and audio until play resumes.

## Flight & Control
- The camera is a first-person view that moves with the airframe.
- Speed profiles range from stable cruise to aggressive turbo.
- Keyboard and gamepad input are supported; commands respect the armed and menu states.
- **Target mode (T).** The simulation projects every tank's oriented box into the camera image. Clicking a box locks that tank and hands control to the autopilot, which turns toward it, descends, and rams it. Manual input cancels the autopilot; T leaves target mode.
- The user menu is opened and closed with the backquote key. Escape is not bound.
- The menu offers speed profile, audio, frame capture, and drone respawn.

## Perception & Training Data
- **Software detection** is the active perception source. Tank boxes are projected from the simulation's known transforms, so they are exact and cost nothing.
- **Capture** exports the current camera frame as a PNG plus a COCO JSON file containing every projected box, at render resolution.
- **Dataset generation** batch-renders labelled frames from the running client at a reduced resolution, randomising drone pose and tank layout per frame. It reuses the gameplay shaders, optics, and box projector, so generated frames match what the detector sees in flight, and writes a `train/` + `valid/` COCO dataset as one zip download. This bootstraps training without hand-flying captures; captures stay the source of truth for validation.
- **Detector training** in `packages/notebooks` fine-tunes RF-DETR Nano on the single class `tank` and exports ONNX for onnxruntime-web plus an experimental LiteRT `.tflite`. The ONNX graph exposes `input` with `dets` (normalised centre-width-height boxes) and `labels` (per-class logits needing a sigmoid).
- **Reduced resolution.** Training and inference use a small square input (384 px, RF-DETR Nano's native size) rather than render resolution; frames are resized to it and boxes mapped back to the live frame.
- The trained model is intended to become the second in-game detection source; software boxes remain the default until it is wired in.

## User Interface
The interface is intentionally minimal and only shows information that is useful in flight.

- **Flight readouts**: compass heading, link quality, flight timer, battery current and consumption, throttle, and armed state.
- **Target overlay**: boxes for visible tanks in target mode, with the locked tank highlighted.
- **Status messages**: transient notifications, signal lost with replacement inbound, and map cleared with redeploy prompt.
- **Menu**: speed, audio, capture frame plus labels, dataset generation, and drone respawn. The paused game stays visible behind it.

## Project Structure
- `packages/game` — WebGPU renderer, HUD, input, autopilot, annotation overlay, dataset generator, and the browser entry point.
- `packages/game/src/wasm` — C++ flight, sensor, and collision simulation compiled to WebAssembly.
- `packages/notebooks` — Kaggle notebooks for detector and policy training and ONNX export.
