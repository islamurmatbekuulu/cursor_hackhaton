"""Face + license-plate anonymization. MUST run before any urban detector.

Primary path: Panoramax/detect_face_plate_sign (YOLO11l) via Ultralytics, loaded
once at startup into a module-level global. Fallback path (no weights present):
OpenCV Haar cascade for faces so the endpoint still returns a blurred image and
honest counts in dev/CI. We blur faces and plates ONLY — never run OCR, never
detect persons/vehicles (KVKK Art. 5/6).

All bytes are handled in memory; nothing is written to disk.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

import cv2
import numpy as np

logger = logging.getLogger("sidecar.anonymize")

# Class names emitted by Panoramax/detect_face_plate_sign that we blur.
_BLUR_CLASSES = {"face", "plate", "license_plate", "licence_plate"}


@dataclass
class AnonymizeResult:
    png_bytes: bytes
    face_count: int
    plate_count: int
    sha256: str


class Anonymizer:
    def __init__(self, model_path: str) -> None:
        self._model = None
        self._mode = "haar-fallback"
        self._haar = None
        self._load(model_path)

    def _load(self, model_path: str) -> None:
        try:
            from ultralytics import YOLO  # heavy import; only at startup

            self._model = YOLO(model_path)
            self._mode = "yolo11l-panoramax"
            logger.info("anonymizer loaded YOLO model from %s", model_path)
            return
        except Exception as exc:  # noqa: BLE001 - degrade gracefully
            logger.warning("YOLO anonymizer unavailable (%s); using Haar face fallback", exc)

        try:
            cascade = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._haar = cv2.CascadeClassifier(cascade)
        except Exception as exc:  # noqa: BLE001
            logger.error("Haar cascade unavailable: %s", exc)
            self._haar = None

    @property
    def mode(self) -> str:
        return self._mode

    def anonymize(self, image_bytes: bytes) -> AnonymizeResult:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("could not decode image")

        if self._model is not None:
            face_count, plate_count = self._blur_with_yolo(img)
        else:
            face_count, plate_count = self._blur_with_haar(img)

        ok, buf = cv2.imencode(".png", img)
        if not ok:
            raise ValueError("could not encode PNG")
        png = buf.tobytes()
        digest = hashlib.sha256(png).hexdigest()
        return AnonymizeResult(png, face_count, plate_count, digest)

    def _blur_with_yolo(self, img: np.ndarray) -> tuple[int, int]:
        faces = plates = 0
        results = self._model.predict(img, verbose=False)
        for res in results:
            names = res.names
            boxes = getattr(res, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                cls_id = int(box.cls[0])
                label = str(names.get(cls_id, "")).lower()
                if label not in _BLUR_CLASSES:
                    continue
                x1, y1, x2, y2 = (int(v) for v in box.xyxy[0])
                _blur_region(img, x1, y1, x2, y2)
                if label == "face":
                    faces += 1
                else:
                    plates += 1
        return faces, plates

    def _blur_with_haar(self, img: np.ndarray) -> tuple[int, int]:
        if self._haar is None:
            return 0, 0
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        detections = self._haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        for (x, y, w, h) in detections:
            _blur_region(img, x, y, x + w, y + h)
        # Haar fallback cannot detect plates; report 0 honestly.
        return len(detections), 0


def _blur_region(img: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> None:
    h, w = img.shape[:2]
    x1 = max(0, min(x1, w - 1))
    x2 = max(0, min(x2, w))
    y1 = max(0, min(y1, h - 1))
    y2 = max(0, min(y2, h))
    if x2 <= x1 or y2 <= y1:
        return
    roi = img[y1:y2, x1:x2]
    # Strong, irreversible blur (kernel scales with region size).
    k = max(15, ((x2 - x1) // 3) | 1)
    img[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)
