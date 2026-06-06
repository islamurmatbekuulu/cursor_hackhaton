# Kaldırım Skoru — CV Sidecar (FastAPI)

Internal ML microservice. Go cannot run YOLO weights, so anonymization +
detection live here. Called service-to-service over HTTPS with
`INTERNAL_SIDECAR_TOKEN`.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness + anonymizer mode + roboflow-configured flag |
| POST | `/anonymize` | multipart `image` → `image/png` (faces+plates blurred) + headers `X-Face-Count`, `X-Plate-Count`, `X-Image-SHA256` |
| POST | `/detect` | multipart `image` + header `X-Anon-Receipt: <sha256>` → `{ detections: [...], source }` |

`/detect` returns **412** unless a fresh `/anonymize` receipt (< 60 s) exists —
this enforces *blur-before-detect* (KVKK).

## Run locally
```bash
cd services/sidecar
python -m venv .venv && . .venv/Scripts/activate   # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
export ROBOFLOW_API_KEY=...            # from repo .env
export INTERNAL_SIDECAR_TOKEN=...      # must match the Go API
uvicorn app.main:app --reload --port 8000
```

## Docker
```bash
docker build -t kaldirim-sidecar services/sidecar
docker run -p 8000:8000 --env-file .env kaldirim-sidecar
```

## Anonymizer weights
Primary model: `Panoramax/detect_face_plate_sign` (YOLO11l). Mount the weights on
a Render disk and set `ANON_MODEL_PATH`. Without weights the service degrades to
an OpenCV Haar **face** fallback (plates not detected) so dev/CI still runs —
production must use the YOLO weights.

## KVKK
- Anonymization always runs before detection (enforced by receipt TTL).
- Only `{face_count, plate_count, image_sha256}` is logged — never raw bytes.
- Hard class allowlist; non-allowlisted classes (incl. any person/vehicle) dropped.
- No OCR anywhere. All bytes in memory (`BytesIO`/numpy); nothing written to disk.
