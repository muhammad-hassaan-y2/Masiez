# Project Overview

## Vision
Masiez is a real-time 3D drone simulation where the drone is an autonomous robot. The complete AI loop — seeing the world and deciding how to fly — runs inside the browser, so a single game page is a working robotics platform. Human operators, autonomous agents, and external experimenters can all use the same simulation.

## Core Principles
- **In-Browser Autonomy**: Perception and policy models execute locally on the game page against the drone's own camera image. The default deployment needs no model-serving infrastructure.
- **Simple by Default, Extendable on Demand**: Heavyweight external transports (WebRTC robotics links) are optional alternatives for running models outside the browser, never a requirement.
- **Creative Freedom**: Specifications define outcomes and constraints, not implementation details, so engineers and AI agents can design clean, idiomatic solutions.
- **Human Takes Priority**: Autonomy assists but never fights the operator; any manual input immediately resumes control.
- **Focused Battlefield**: Scenarios feature only hostile soldiers and tanks, so detection targets are few, clear, and trainable.

## Subsystems
1. **3D World** — drone flight, terrain, collisions, and battlefield scenarios.
2. **Drone API** — the autonomy loop inside the browser, plus optional external control links.
3. **AI Agent & Training** — model training on Kaggle and deployment into the browser.
4. **User Interface** — flight HUD and the user menu hosting level, settings, and autonomy controls.
