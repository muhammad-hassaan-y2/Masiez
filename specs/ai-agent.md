# AI Agent & Kaggle Training Specification

## Purpose
Enable researchers and AI agents to connect to the drone from a **Jupyter** environment via **LiveKit**, run real-time perception and control loops, and prepare datasets for model training on **Kaggle**.

## Jupyter-to-Drone Connection
- **LiveKit Python SDK**: The Jupyter notebook connects directly to the LiveKit room as a participant.
- **Zero-Copy Frame Subscription**: Video frames from the drone's `drone-fpv` track are received via WebRTC and converted into standard arrays for computer vision or deep learning inference.
- **Closed-Loop Control**: The notebook processes incoming video and telemetry and publishes control commands or detection overlays back to the drone over LiveKit data channels.

## Kaggle Training Workflow
- **Synchronized Dataset Collection**: During manual or autonomous flights, the Jupyter client can record synchronized camera frames and telemetry snapshots.
- **Model Training & Deployment**: Collected datasets can be exported for training vision or reinforcement learning models on Kaggle, and trained weights can be loaded back into the Jupyter notebook to control the drone over LiveKit.
