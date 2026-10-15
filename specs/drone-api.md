# Drone API Specification

## Purpose
Define how the drone is controlled — by its own in-browser autonomy, by a human, or by external agents — while keeping the default path free of infrastructure.

## Primary Path: In-Browser Control Loop
- The drone's camera image feeds an on-page detector; detections feed an on-page policy that outputs velocity commands; commands drive the same flight path a human uses. No frames leave the browser.
- The loop runs continuously while enabled and is visible: overlay boxes, autonomy status, and inference cost are reported to the operator.

## Human Arbitration
- Manual input of any kind takes precedence over autonomy immediately, and autonomy resumes after input stops. The human can also seize control by disarming or triggering the emergency stop.

## Optional External Links (Alternative Mode)
- When models or controllers must run **outside** the browser, the drone may act as a WebRTC robot: streaming FPV video and telemetry, accepting teleoperation axes, commands, and remote procedure calls over a real-time link. All of this is opt-in and off by default.
- A lightweight signaling/telemetry service exists for session metadata and remote experiments; it never processes video frames.

## Safety
- Commands are validated against operational state (arming, geofence, emergency stop) before execution, whichever source issues them.
