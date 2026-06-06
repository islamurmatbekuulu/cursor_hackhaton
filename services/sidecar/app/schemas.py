"""Pydantic v2 response models. Mirrors the Go domain detection shape."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Detection(BaseModel):
    """A single urban-object detection on an already-anonymized image."""

    cls: str = Field(serialization_alias="class", validation_alias="class")
    confidence: float
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0

    model_config = {"populate_by_name": True}


class DetectResponse(BaseModel):
    detections: list[Detection]
    source: str  # "roboflow" | "local-fallback" | "none"


class HealthResponse(BaseModel):
    status: str
    anonymizer: str
    roboflow_configured: bool
