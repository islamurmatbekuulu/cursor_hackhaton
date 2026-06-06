"""Sidecar configuration, read from environment at startup (fail-soft).

Secrets (Roboflow key, internal token) are read here. The Roboflow key is
required for live detection; if absent we log a warning and the detector falls
back to the local-stub path so the service still starts.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    roboflow_api_key: str
    roboflow_model: str
    internal_token: str
    anon_model_path: str
    receipt_ttl_seconds: int
    confidence: float
    overlap: float

    @property
    def roboflow_url(self) -> str:
        # e.g. https://serverless.roboflow.com/visual-pollution-pc2as/9
        return f"https://serverless.roboflow.com/{self.roboflow_model}"


def load_settings() -> Settings:
    return Settings(
        roboflow_api_key=os.getenv("ROBOFLOW_API_KEY", ""),
        roboflow_model=os.getenv("ROBOFLOW_MODEL", "visual-pollution-pc2as/9"),
        internal_token=os.getenv("INTERNAL_SIDECAR_TOKEN", ""),
        # Path to the Panoramax face/plate/sign YOLO11l weights (mounted on Render disk).
        anon_model_path=os.getenv("ANON_MODEL_PATH", "weights/panoramax/model.pt"),
        receipt_ttl_seconds=int(os.getenv("ANON_RECEIPT_TTL_SECONDS", "60")),
        confidence=float(os.getenv("ROBOFLOW_CONFIDENCE", "0.4")),
        overlap=float(os.getenv("ROBOFLOW_OVERLAP", "0.5")),
    )


settings = load_settings()
