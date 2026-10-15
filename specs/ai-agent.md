# AI Agent & Training Specification

## Purpose
Make the drone a trainable robot: collect realistic data, train models externally on **Kaggle**, and deploy them so inference happens entirely in the browser.

## Two Models, One Loop
- **Detector**: finds hostile targets in the FPV image and reports their screen position and apparent size.
- **Pursuit policy**: a reinforcement-learning policy that consumes the selected target's image-space position and size plus the drone's own velocity, and outputs velocity commands rewarded for closing the distance.

The two form the autonomy loop the operator toggles in-game.

## Training Workflow
- Training notebooks reproduce the game's visual conditions (synthetic or captured frames) so models can be trained end-to-end on Kaggle without the game running.
- Exported models must target the browser runtime with a fixed, documented input/output contract shared between the training side and the game side; a verification step in each notebook proves the contract holds.
- Until trained weights are deployed, the game runs clearly-labeled built-in substitutes so the pipeline can be exercised at any time.

## Optional External Experimentation (Alternative Mode)
- For experiments that need full-resolution frames, physics state, or Python tooling outside the browser, notebooks can connect to the drone over the optional real-time link, stream frames, inspect telemetry, issue teleoperation, and record synchronized datasets for Kaggle — the same loop the browser runs, executed externally.
