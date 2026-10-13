# 3D World Specification

## Purpose
Provide a responsive 3D environment for quadcopter flight, target engagement, and sensor simulation across multiple selectable levels.

## Environment & Levels
- **Multiple Levels**: Support distinct environments (such as an airfield, urban sectors, desert canyons, or island terrain) that the user selects from the User Menu (`` ` ``).
- **Terrain & Structures**: Ground surfaces and static obstacles enforce collision detection with the drone and projectiles.

## Battlefield Entities & Kamikaze Mission
- **Soldiers and Tanks Only**: Dynamic ground units consist exclusively of **Soldiers** and **Tanks**. Civilian pedestrians and unrelated vehicle types are omitted.
- **Simple Box Representation**: Both soldiers and tanks are rendered as simple 3D boxes scaled to their respective footprints. This keeps rendering fast and allows 3D artist assets to be dropped in later without changing gameplay logic.
- **Kamikaze Explosive Drone**: The drone does not shoot missiles or projectiles. Instead, it carries an explosive warhead and destroys hostile targets through direct kamikaze impact.
- **Multi-Drone Fleet & Scoring**: Each level features a set number of hostile targets and a limited fleet of FPV drones. A strike scores a hit when the drone detonates on a hostile target. Destroying a drone does not end the mission—the operator deploys the next available drone until all targets are destroyed or no drones remain.

## Camera Perspectives
- **First-Person View (FPV)**: Gimbal-stabilized operator perspective used both for human piloting and for the LiveKit robot video stream.
- **Third-Person Chase View**: External camera following the drone for spatial awareness.
