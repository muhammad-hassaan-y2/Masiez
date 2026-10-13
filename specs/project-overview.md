# Project Overview

## Vision
Masiez provides a real-time 3D drone simulation where the drone operates as a standalone robot over **LiveKit WebRTC**. Human operators and AI agents can observe, control, and train autonomous flight behaviors without routing high-bandwidth video streams through a central application server.

## Core Principles
- **Creative Freedom**: Specifications define high-level goals and outcomes rather than rigid implementation details or directory structures, allowing engineers and AI agents to design clean, idiomatic solutions.
- **Drone as a LiveKit Robot**: The simulated drone publishes its camera feed and telemetry directly to a LiveKit room. External consumers—such as Jupyter notebooks and training pipelines—connect directly to the room as peers.
- **Lightweight Server Footprint**: The backend server handles lightweight signaling, token generation, and high-level state coordination, never decoding or processing raw video frames.
- **Focused Battlefield Entities**: Scenarios feature only **Soldiers** and **Tanks**, rendered initially as simple 3D boxes so visual assets can be swapped effortlessly later.

## Subsystems
1. **[3D World](3d-world.md)**: Simulates drone flight, terrain collisions, and battlefield scenarios with soldiers and tanks.
2. **[Drone API & LiveKit Link](drone-api.md)**: Connects the drone and external controllers via LiveKit WebRTC video and data channels.
3. **[AI Agent & Training](ai-agent.md)**: Connects from Jupyter notebooks via LiveKit to run inference, teleoperate the drone, and collect datasets for Kaggle training.
4. **[User Interface](user-interface.md)**: Combines an operator HUD with a User Menu toggled via `` ` `` for level selection and game settings.
