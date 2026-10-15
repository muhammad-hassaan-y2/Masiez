# 3D World Specification

## Purpose
Provide a responsive 3D environment for quadcopter flight, target engagement, and perception training across multiple selectable levels.

## Environment & Levels
- **Multiple Levels**: Distinct environments (airfield, urban, open-map sectors) selectable from the user menu, not during active flight.
- **Solid World**: Terrain and structures respect collision; striking anything at speed detonates the drone.

## Battlefield Entities & Kamikaze Mission
- **Soldiers and Tanks Only**: Dynamic ground units are exclusively hostile/allied soldiers and tanks, rendered as simple geometric boxes so richer assets can replace them without gameplay changes. This also keeps the detectable visual vocabulary small and stable for training.
- **Kamikaze Strike**: The drone carries a warhead instead of projectiles; destroying a target means flying into it.
- **Fleet Scoring**: Each mission pairs a target count with a limited drone fleet. Losses deploy replacements until all targets are destroyed or the fleet is exhausted.

## Camera Perspectives
- **FPV**: Gimbal-stabilized first-person view. This image is also the input the in-browser AI sees, so what the operator sees is exactly what the models perceive.
- **Chase**: Third-person view for spatial awareness.
