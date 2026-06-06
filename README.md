# Kaldırım Skoru

> İstanbul kaldırımları için görsel kirlilik ve yürünebilirlik skoru.
> A privacy-first civic-tech tool that scores a street's sidewalk quality (A–F)
> from Google Street View imagery, under strict KVKK constraints.

Type a street name → the backend pulls Street View imagery along the road →
**faces and license plates are irreversibly blurred before any analysis** →
urban-pollution objects (potholes, clutter, garbage, signage, graffiti…) are
detected → a transparent weighted formula produces a 0–100 score and an A–F
grade, a pollution heatmap, and a downloadable "Şikayet Dosyası" (complaint PDF).

---

## Architecture

```
            apps/web (Next.js 14)         apps/mobile (Expo SDK 51)
                  │  /api/score                    │  /api/v1/score/photo
                  ▼                                ▼
        ┌──────────────────────────────────────────────────┐
        │  services/api — Go (masterfabric-go architecture) │
        │  POST /api/v1/score        POST /api/v1/score/photo│
        └───────┬───────────────────────────────┬──────────┘
                │ Street View (Geocode/Roads/    │
                │ Static + metadata)             │ multipart image
                ▼                                ▼
        Google Maps Platform          services/sidecar — Python FastAPI
                                       /anonymize  (blur faces+plates FIRST)
                                       /detect     (Roboflow visual-pollution)
```

| Package | Stack | Role |
|---|---|---|
| `services/api` | **Go — [masterfabric-go](https://github.com/gurkanfikretgunak/masterfabric-go) (mandated)** | Clean/hexagonal + DDD backend; scoring orchestration |
| `services/sidecar` | Python 3.11, FastAPI, Ultralytics, OpenCV | Anonymization + Roboflow detection (Go can't run YOLO) |
| `apps/web` | Next.js 14 App Router, Tailwind, react-leaflet | Search, heatmap, ScoreCard, PDF/CSV report |
| `apps/mobile` | Expo SDK 51, expo-router | Photo capture → score result |
| `packages/shared-types` | TypeScript + zod | Shared `ScoreRequest`/`ScoreResponse`/`Detection`/`Grade` |

### Mandated backend: masterfabric-go (AGPL v3.0)

Per the hackathon ruleset, the Go backend **must** use the
[`masterfabric-go`](https://github.com/gurkanfikretgunak/masterfabric-go)
architecture. It is vendored into `services/api/` (its `LICENSE`, **AGPL
v3.0**, is preserved there). We did **not** rewrite its architecture — the
Kaldırım Skoru feature is added as a **new bounded context** that follows its
clean/hexagonal + DDD layout:

```
services/api/internal/
  domain/walkability/         entities, repo ports, pure scoring service (+tests)
  application/walkability/    use cases: ScoreStreet, ScorePhoto (orchestration)
  infrastructure/
    streetview/               Google Maps client (Geocode, Roads, Static)
    sidecar/                  CV sidecar client (anonymize → detect)
    scoring/                  scoring.config.json loader
    http/handler/walkability/ HTTP handlers (reuse its response/validator/slog)
```

Routes are wired into masterfabric-go's existing Chi router and reuse its error
envelopes, validator, and structured logging. It runs with
`KAFKA_ENABLED=false` (in-process EventBus); the scoring path needs neither
Postgres nor Redis.

---

## Scoring formula (transparent, editable)

Weights and caps live in [`scoring.config.json`](./scoring.config.json) and are
loaded by the Go API at startup — re-tunable **without a code change**.

For each sampled point, for each detected class *c*:

```
contribution(c) = weight(c) × min(count(c) / P, cap(c)) × avgConfidence(c)
Score           = max(0, 100 − Σ contribution(c))
```

where `P` is the number of sampled points. The score maps to a grade:

| Grade | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Score ≥ | 85 | 70 | 55 | 40 | 25 | 0 |

---

## KVKK (privacy) — blur-before-detect, no raw storage

This project is built under Türkiye's KVKK. See
[`KVKK_COMPLIANCE.md`](./KVKK_COMPLIANCE.md) and
[`DATA_DELETION.md`](./DATA_DELETION.md). Hard rules enforced in code:

- **Anonymization always runs before detection.** The sidecar's `/detect`
  returns `412` without a fresh `/anonymize` receipt (image SHA-256, < 60 s).
- Only `{face_count, plate_count, image_sha256}` is ever logged — never raw bytes.
- Raw imagery lives **in memory only** (Go `multipart`/`bytes`, Python `numpy`);
  nothing is written to disk, no public buckets, no images committed to the repo.
- A hard **class allowlist** is enforced at the sidecar boundary; any
  person/vehicle/face/plate class is dropped. **No OCR anywhere.**
- No model is fine-tuned on Street View data.

---

## Run locally

Prerequisites: Go 1.25+, Node 20+, Python 3.11+, Docker (optional).
Copy `.env` and provide `GOOGLE_MAPS_API_KEY`, `ROBOFLOW_API_KEY`,
`INTERNAL_SIDECAR_TOKEN`.

```bash
# 1) CV sidecar (Python)
cd services/sidecar
pip install -r requirements.txt
uvicorn app.main:app --port 8000          # or: docker build -t kaldirim-sidecar . && docker run -p 8000:8000 --env-file ../../.env kaldirim-sidecar

# 2) Go API (masterfabric-go) — scoring path needs no DB
cd services/api
SCORING_CONFIG_PATH=../../scoring.config.json \
KAFKA_ENABLED=false SIDECAR_URL=http://localhost:8000 \
go run ./cmd/server                       # masterfabric-go also ships make docker-up / ./dev.sh for the full platform

# 3) Web
npm install
npm run dev:web                           # http://localhost:3000  (set API_BASE=http://localhost:8080)

# 4) Mobile
cd apps/mobile && npx expo start          # set extra.apiBase / EXPO_PUBLIC_API_BASE to your API
```

### Google Maps — one key for everything
A single `GOOGLE_MAPS_API_KEY` (with Geocoding, Roads, Street View Static, Maps
JavaScript, Maps Static enabled) is used by both backend and web.
`GOOGLE_MAPS_BACKEND_KEY` mirrors it. **URL signing is optional** — applied only
if `GOOGLE_MAPS_SIGNING_SECRET` is present (no secret is provided, so calls are
unsigned).

---

## AI Tools / Cursor

This repository was built with **Cursor IDE** and documents its AI workflow as
a first-class artifact:

- **`.cursor/rules/`** — a layered ruleset (`00-root`, `20-backend-go` mandating
  masterfabric-go, `30-sidecar-python`, `40-kvkk` red lines, web/mobile rules)
  that constrains every generation, plus `AGENTS.md` / `CLAUDE.md`.
- **Cursor CLI pre-commit hook** ([`.husky/pre-commit`](./.husky/pre-commit)) —
  runs headless `agent -p` to review each staged diff for KVKK violations before
  it can be committed (degrades gracefully without the CLI/key).
- **GitHub Actions** ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) —
  builds/vets/tests the Go API, typechecks web + shared-types, compiles the
  sidecar, and runs a best-effort Cursor CLI KVKK review job.
- **Skills** — web UI follows `ui-ux-pro-max` + `design-taste-frontend`; mobile
  follows `building-native-ui` + `vercel-react-native-skills`.

Commit discipline is conventional-commits-only, small and frequent, so the
development story is legible in `git log`.

---

## Licensing

The vendored backend retains its **AGPL v3.0** license
(`services/api/LICENSE`). Credit: masterfabric-go by
[@gurkanfikretgunak](https://github.com/gurkanfikretgunak/masterfabric-go).
