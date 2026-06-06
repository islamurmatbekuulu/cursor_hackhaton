"""Kaldırım Skoru CV sidecar — FastAPI app.

Endpoints:
  GET  /healthz   -> liveness + anonymizer mode
  POST /anonymize -> blur faces/plates, return image/png + receipt headers
  POST /detect    -> urban-object detection on the blurred image (requires a
                     fresh anonymization receipt; enforces blur-before-detect)

KVKK: anonymization always runs before detection; only {face_count, plate_count,
image_sha256} are logged; raw bytes live only in memory.
"""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile

from .anonymize import Anonymizer
from .config import settings
from .detect import Detector
from .receipts import ReceiptStore
from .schemas import DetectResponse, HealthResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("sidecar")

app = FastAPI(title="Kaldırım Skoru CV Sidecar", version="1.0.0")

# Models/clients loaded ONCE into module-level globals (per sidecar rules).
anonymizer = Anonymizer(settings.anon_model_path)
detector = Detector(settings)
receipts = ReceiptStore(settings.receipt_ttl_seconds)


def require_internal_token(authorization: str | None = Header(default=None)) -> None:
    """Validate the internal service-to-service Bearer token (if configured)."""
    if not settings.internal_token:
        return  # not configured (dev) -> allow
    expected = f"Bearer {settings.internal_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="invalid internal token")


@app.get("/healthz", response_model=HealthResponse)
def healthz() -> HealthResponse:
    return HealthResponse(
        status="ok",
        anonymizer=anonymizer.mode,
        roboflow_configured=bool(settings.roboflow_api_key),
    )


@app.post("/anonymize", dependencies=[Depends(require_internal_token)])
async def anonymize(image: UploadFile = File(...)) -> Response:
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty image")

    result = anonymizer.anonymize(raw)
    # KVKK receipt log — never logs raw bytes or identities.
    logger.info(
        "anonymize face_count=%d plate_count=%d image_sha256=%s",
        result.face_count, result.plate_count, result.sha256,
    )
    receipts.issue(result.sha256)

    return Response(
        content=result.png_bytes,
        media_type="image/png",
        headers={
            "X-Face-Count": str(result.face_count),
            "X-Plate-Count": str(result.plate_count),
            "X-Image-SHA256": result.sha256,
        },
    )


@app.post(
    "/detect",
    response_model=DetectResponse,
    dependencies=[Depends(require_internal_token)],
)
async def detect(
    image: UploadFile = File(...),
    x_anon_receipt: str | None = Header(default=None),
) -> DetectResponse:
    # Enforce ordering: a fresh /anonymize receipt MUST exist for these bytes.
    if not receipts.is_fresh(x_anon_receipt or ""):
        raise HTTPException(
            status_code=412,
            detail="missing or stale anonymization receipt; call /anonymize first",
        )

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty image")

    detections, source = detector.detect(raw)
    logger.info("detect returned %d detections via %s", len(detections), source)
    return DetectResponse(detections=detections, source=source)
