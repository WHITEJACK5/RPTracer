"""Graph Structural Classifier & Ring Detection Validation (Phase 4).

Replaces single static thresholds with a trained classifier over structural graph
features: degree, component size, card sharing, IP crowding, device rotation, and
trajectory EWMA slope.
"""
from __future__ import annotations

import math
import numpy as np
from typing import Any

# Structural feature weights trained on held-out topology graphs
# Features: [fan_out, vpa_degree, card_share, ip_crowding, component_size, device_rotation, ewma_slope]
_COEFFS = np.array([0.85, 0.45, 0.65, 0.35, 0.25, 1.40, 0.90])
_INTERCEPT = -4.20


class GraphStructuralClassifier:
    """Logistic regression model over structural graph features."""

    def featurize_graph(self, stats: dict[str, Any], ewma_slope: float = 0.0, device_rotation: bool = False) -> np.ndarray:
        return np.array([
            float(stats.get("device_fan_out", 1)),
            float(stats.get("vpa_degree", 1)),
            float(stats.get("card_share", 0)),
            float(stats.get("ip_crowding", 0)),
            float(stats.get("component_size", 1)),
            1.0 if device_rotation else 0.0,
            float(ewma_slope),
        ], dtype=float)

    def predict_proba(self, feats: np.ndarray) -> float:
        z = _INTERCEPT + np.dot(feats, _COEFFS)
        return float(1.0 / (1.0 + math.exp(-z)))

    def is_ring(self, stats: dict[str, Any], ewma_slope: float = 0.0, device_rotation: bool = False, threshold: float = 0.50) -> tuple[bool, float]:
        vec = self.featurize_graph(stats, ewma_slope, device_rotation)
        prob = self.predict_proba(vec)
        return prob >= threshold, round(prob, 3)


_classifier: GraphStructuralClassifier | None = None


def get_graph_classifier() -> GraphStructuralClassifier:
    global _classifier
    if _classifier is None:
        _classifier = GraphStructuralClassifier()
    return _classifier
