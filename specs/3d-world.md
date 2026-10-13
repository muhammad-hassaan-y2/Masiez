# 3D World Specification

## Purpose
Provide a responsive 3D environment for quadcopter flight, target engagement, and sensor simulation across multiple selectable levels.

## Environment & Levels
- **Multiple Levels**: Support distinct environments (such as an airfield, urban sectors, desert canyons, or island terrain) that the user selects from the User Menu (`` ` ``).
- **Terrain & Structures**: Ground surfaces and static obstacles enforce collision detection with the drone and projectiles.

## Battlefield Entities
- **Soldiers and Tanks Only**: Dynamic ground units consist exclusively of **Soldiers** and **Tanks**. Civilian pedestrians and unrelated vehicle types are omitted.
- **Simple Box Representation**: Both soldiers and tanks are rendered as simple 3D boxes scaled to their respective footprints. This keeps rendering fast and allows 3D artist assets to be dropped in later without changing gameplay logic.
- **Autonomous Combat**: Allied and hostile units move across the terrain and engage each other in real time.

## Camera Perspectives
- **First-Person View (FPV)**: Gimbal-stabilized operator perspective used both for human piloting and for the LiveKit robot video stream.
- **Third-Person Chase View**: External camera following the drone for spatial awareness.
