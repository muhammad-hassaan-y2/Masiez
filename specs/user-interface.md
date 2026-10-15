# User Interface Specification

## Purpose
Give the operator an honest flight HUD, clear sight of mission state, and a single place to configure everything — including how much of the flight the AI handles.

## User Menu
- Toggled during flight; opening it frees the pointer for interaction.
- Provides: level selection, sound, flight speed profile, camera view, mission restart and fleet deploy, the **autonomy switch (OFF / DETECT / FOLLOW)** with live status of which engines the browser is running, and the optional external robotics link (connect/disconnect and status).
- Levels are changed only here, never by hotkeys during play.

## Flight HUD
- Telemetry: altitude, speed, heading, battery, warhead status.
- Mission: targets destroyed versus total, drones remaining, score.
- Targeting: impact reticle, screen-space hostile markers, lock states, optical zoom overlay.
- **AI layer**: detected-target bounding boxes with labels and confidence, autonomy mode, whether the AI is currently seeking or following, and inference cost. Boxes must always be attributable to either the in-browser model or an external annotation source.

## Clarity Rule
The operator can tell at a glance who is flying the drone — them, the in-browser AI, or a remote experimenter — and which models are backing the AI.
