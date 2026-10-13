# Drone API & LiveKit Link Specification

## Purpose
Define how external controllers, AI agents, and notebooks communicate with the drone with minimal latency and zero server-side video processing overhead.

## LiveKit Robot Architecture
- **Direct WebRTC Streaming**: The drone joins a LiveKit room (`drone`) as a robot participant and publishes its onboard camera feed as a WebRTC video track (`drone-fpv`).
- **No Server Frame Processing**: The backend server does not receive, decode, or relay camera frames. It only issues LiveKit access tokens and handles lightweight control metadata.
- **Low-Latency Data Channels**:
  - **Telemetry (`drone:telemetry`)**: Published directly by the drone over LiveKit data channels (position, attitude, velocity, battery, and state).
  - **Teleoperation & Commands (`teleop:command`)**: Sent by connected notebooks or AI agents over LiveKit data channels to arm, take off, land, or maneuver the drone.
  - **Vision Annotations (`ai:vision_annotations`)**: Optional bounding boxes sent back to the drone HUD for real-time visual feedback.
