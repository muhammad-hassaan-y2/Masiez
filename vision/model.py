"""Model interface and a placeholder detector.

Replace ``PlaceholderDetector`` with a trained model (ONNX, Ultralytics, etc.)
once the training notebook has produced weights.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Detection:
    label: str
    bbox: tuple[float, float, float, float]  # x, y, w, h (pixels)
    confidence: float

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "bbox": [round(v, 1) for v in self.bbox],
            "confidence": round(self.confidence, 3),
        }


class Detector:
    """Base interface for a vision model."""

    def predict(self, image: np.ndarray) -> list[Detection]:
        raise NotImplementedError


class PlaceholderDetector(Detector):
    """Returns a fixed box so the pipeline can be exercised end-to-end."""

    def predict(self, image: np.ndarray) -> list[Detection]:
        h, w = image.shape[:2]
        return [
            Detection(
                label="placeholder",
                bbox=(w * 0.25, h * 0.25, w * 0.5, h * 0.5),
                confidence=0.5,
            )
        ]


def load_detector() -> Detector:
    """Return the active detector. Swap this to load real weights."""
    return PlaceholderDetector()
