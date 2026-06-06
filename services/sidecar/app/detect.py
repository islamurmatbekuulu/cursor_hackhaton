"""Urban-object detection on ALREADY-ANONYMIZED images.

Primary: Roboflow Serverless `visual-pollution-pc2as/9` over HTTPS. On repeated
upstream failures (3x consecutive 429/5xx) we flip to a local fallback stub
(Ultralytics garbage/pothole) — kept minimal here and documented as such.

A hard class allowlist is enforced: any class outside the canonical merged set
is dropped at this boundary (KVKK §7.1 rule 2). No person/vehicle classes are
ever requested or returned.
"""

from __future__ import annotations

import base64
import logging

import httpx

from .config import Settings
from .schemas import Detection

logger = logging.getLogger("sidecar.detect")

# Canonical merged allowlist (mirrors Go model.AllowedClasses()).
ALLOWED = {
    "pothole",
    "garbage",
    "construction_road",
    "culture_sidewalk",
    "broken_signage",
    "faded_signage",
    "graffiti",
    "unkempt_facade",
}

# Maps upstream (Roboflow/Smartathon) raw class names to our canonical keys.
# Anything not present here is dropped.
_CLASS_MAP = {
    "pothole": "pothole",
    "potholes": "pothole",
    "garbage": "garbage",
    "construction road": "construction_road",
    "construction_road": "construction_road",
    "culture sidewalk": "culture_sidewalk",  # upstream typo for "clutter sidewalk"
    "clutter sidewalk": "culture_sidewalk",
    "culture_sidewalk": "culture_sidewalk",
    "broken signage": "broken_signage",
    "broken_signage": "broken_signage",
    "faded signage": "faded_signage",
    "faded_signage": "faded_signage",
    "graffiti": "graffiti",
    "unkempt facade": "unkempt_facade",
    "unkempt_facade": "unkempt_facade",
    # "defective speedbumps" intentionally unmapped -> dropped (not in allowlist).
}

_MAX_CONSECUTIVE_FAILURES = 3


class Detector:
    def __init__(self, settings: Settings) -> None:
        self._s = settings
        self._consecutive_failures = 0
        self._client = httpx.Client(timeout=30.0)

    def detect(self, png_bytes: bytes) -> tuple[list[Detection], str]:
        if not self._s.roboflow_api_key:
            logger.warning("ROBOFLOW_API_KEY missing; returning no detections")
            return [], "none"

        if self._consecutive_failures >= _MAX_CONSECUTIVE_FAILURES:
            logger.warning("roboflow circuit open; using local fallback")
            return self._local_fallback(png_bytes), "local-fallback"

        try:
            dets = self._roboflow(png_bytes)
            self._consecutive_failures = 0
            return dets, "roboflow"
        except Exception as exc:  # noqa: BLE001
            self._consecutive_failures += 1
            logger.warning("roboflow detect failed (%s/%s): %s",
                           self._consecutive_failures, _MAX_CONSECUTIVE_FAILURES, exc)
            return self._local_fallback(png_bytes), "local-fallback"

    def _roboflow(self, png_bytes: bytes) -> list[Detection]:
        b64 = base64.b64encode(png_bytes).decode("ascii")
        resp = self._client.post(
            self._s.roboflow_url,
            params={
                "api_key": self._s.roboflow_api_key,
                "confidence": int(self._s.confidence * 100),
                "overlap": int(self._s.overlap * 100),
            },
            content=b64,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code >= 500 or resp.status_code == 429:
            raise RuntimeError(f"roboflow upstream {resp.status_code}")
        resp.raise_for_status()
        data = resp.json()
        return _map_predictions(data)

    def _local_fallback(self, png_bytes: bytes) -> list[Detection]:
        # Minimal, honest stub: a full local Ultralytics path (garbage + pothole)
        # would load weights here. Returns empty rather than fabricating data.
        logger.info("local fallback detector returned no detections (stub)")
        return []


def _map_predictions(data: dict) -> list[Detection]:
    image = data.get("image", {}) or {}
    img_w = float(image.get("width") or 0) or 1.0
    img_h = float(image.get("height") or 0) or 1.0

    out: list[Detection] = []
    for pred in data.get("predictions", []) or []:
        raw = str(pred.get("class", "")).strip().lower()
        canonical = _CLASS_MAP.get(raw)
        if canonical is None or canonical not in ALLOWED:
            continue  # dropped at the boundary
        out.append(
            Detection(
                cls=canonical,
                confidence=float(pred.get("confidence", 0.0)),
                x=float(pred.get("x", 0.0)) / img_w,
                y=float(pred.get("y", 0.0)) / img_h,
                width=float(pred.get("width", 0.0)) / img_w,
                height=float(pred.get("height", 0.0)) / img_h,
            )
        )
    return out
