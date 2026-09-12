# Masiez — Autonomous Drone Simulation Platform

An autonomous drone system composed of three independent, decoupled subsystems:

1. **Interactive 3D World** — A real-time simulated environment with terrain, obstacles, and 3D drone assets
2. **Drone API / MCP** — A protocol layer exposing drone sensor data and navigation commands via the Model Context Protocol
3. **AI Agent** — AI models that observe the drone's state, reason about missions, and issue commands through the MCP interface

## Architecture

```
┌──────────────────┐     MCP (JSON-RPC 2.0)     ┌──────────────────┐
│                  │◄───── Tools & Resources ────►│                  │
│    AI Agent      │                              │  Drone MCP       │
│  (LLM / VLM)    │                              │  Server          │
└──────────────────┘                              └────────┬─────────┘
                                                           │
                                                    MAVSDK / MAVLink
                                                           │
                                                  ┌────────▼─────────┐
                                                  │  Flight Controller│
                                                  │  (PX4 SITL)      │
                                                  └────────┬─────────┘
                                                           │
                                                  ┌────────▼─────────┐
                                                  │  3D World         │
                                                  │  (Simulator)      │
                                                  └──────────────────┘
```

## Specifications

All specs are framework-agnostic, human-readable, and serve as the source of truth:

| Spec | Description |
|---|---|
| [Project Overview](specs/project-overview.md) | Vision, architecture, design principles, phasing |
| [3D World](specs/3d-world.md) | Environment, drone model, sensor simulation, scene types |
| [Drone API](specs/drone-api.md) | MCP interface contract — tools, resources, state machine, safety |
| [AI Agent](specs/ai-agent.md) | Mission lifecycle, vision pipeline, decision patterns |
| [User Interface](specs/user-interface.md) | Chat, dashboard, autonomous mode, human overrides |

## Design Principles

- **Framework Agnostic** — Specs describe WHAT, not HOW. Same specs, any language.
- **Simulation Parity** — Identical API for simulated and physical drones.
- **Safety by Default** — 4-tier defense in depth.
- **Model Agnostic** — Any AI model with tool-calling and vision support.

## Project Structure

```
├── specs/          # Source of truth — behavioral specifications
├── src/            # Implementation (TBD)
└── tests/          # Test suites (TBD)
```

## License

TBD
