# Kaldırım Skoru — 6-Hour Build-Ready Technical Playbook
**Istanbul Visual Pollution / Sidewalk Walkability Score**

## TL;DR
- **Primary CV stack:** Call the Roboflow Universe model `visual-pollution-pc2as/9` (5 Smartathon-derived classes; License: MIT; mAP@50 = 57.3%, Precision = 61.3%, Recall = 57.7%) directly over HTTPS from the Go API, with a small Python FastAPI sidecar on Render handling (a) face + license-plate anonymization via `Panoramax/detect_face_plate_sign` (YOLO11l, plate mAP50 ≈ 0.889, face mAP50 ≈ 0.657, sign mAP50 ≈ 0.898 per its HF model card) and (b) gap-filling classes (garbage, traffic sign, second-opinion pothole) via Ultralytics models pulled from `keremberke/yolov5m-garbage`, `nezahatkorkmaz/traffic-sign-detection`, and `cazzz307/Pothole-Finetuned-YoloV8`.
- **Architecture:** Next.js (Vercel) ↔ Go API (Render) ↔ Python CV sidecar (Render) → Roboflow Serverless. Heatmap + PDF/CSV rendered client-side. Expo app shares the same `/score` endpoint.
- **Decisive bets:** (1) Roboflow Serverless Hosted API beats HF Inference Providers for this task because HF's `hf-inference` provider states verbatim (huggingface.co/docs/inference-providers/en/providers/hf-inference): *"As of July 2025, hf-inference focuses mostly on CPU inference (e.g. embedding, text-ranking, text-classification, or smaller LLMs that have historical importance like BERT or GPT-2)"* — so most relevant object-detection model cards we surveyed display *"This model isn't deployed by any Inference Provider"*. (2) Cursor CLI (`agent -p`) wired into a Git pre-commit hook produces a reproducible "AI development trace" that directly addresses the 10-pt AI-adaptation criterion.

---

## 1. Final Recommended Model Stack

### 1.1 Decision: Roboflow > Hugging Face for hosted inference in this hackathon
HF object-detection model cards we surveyed (`peterhdd/pothole-detection-yolov8`, `cazzz307/Pothole-Finetuned-YoloV8`, `keremberke/yolov5m-garbage`, `Panoramax/detect_face_plate_sign`, `nezahatkorkmaz/traffic-sign-detection`, `morsetechlab/yolov11-license-plate-detection`) all show **"This model isn't deployed by any Inference Provider"** on the HF Hub. Consuming HF object-detection models therefore requires *self-hosting* (`ultralytics`/`transformers`) — i.e., a Python sidecar or HF Space. Conversely, Roboflow Serverless Hosted Inference is a **plain REST endpoint** (`https://serverless.roboflow.com/{model}/{version}`) callable from any HTTP client (Go included) with no SDK; Roboflow's Public plan provides **$60/month in free credits** (per Roboflow pricing page and G2's pricing summary), which converts (at the published rate of 1 credit = 1,000 cloud inferences and $4 per additional credit, per checkthat.ai's Roboflow pricing analysis) to **≈ 15,000 free Serverless cloud inferences/month** — more than enough for a 6-hour build + demo. **Decision: Roboflow primary, HF self-hosted in a Python sidecar for the 2-3 classes Roboflow doesn't cover.**

### 1.2 Primary detector (call directly from Go)
- **Model:** `visual-pollution-pc2as` v9 — Roboflow Universe (`https://universe.roboflow.com/visual-pollution-056la/visual-pollution-pc2as`)
- **Endpoint:** `https://serverless.roboflow.com/visual-pollution-pc2as/9?api_key=$ROBOFLOW_API_KEY`
- **Classes (5):** `pothole`, `garbage`, `construction road`, `culture sidewalk` (project's typo for "clutter sidewalk"), `defective speedbumps`
- **Metrics:** mAP@50 = 57.3%, Precision = 61.3%, Recall = 57.7% (4,776 training images)
- **License:** MIT
- **Call format:** `POST` raw base64-encoded image in body; header `Content-Type: application/x-www-form-urlencoded`; optional query params `confidence` (default 50), `overlap` (default 50). Returns JSON `{ predictions:[{x,y,width,height,confidence,class,class_id}], image:{width,height}, inference_id }`.

> The Cairo University Smartathon project at `universe.roboflow.com/cairo-university-x0l5p/smartathon-jqemg` has the canonical 10-class taxonomy (`GRAFFITI, POTHOLES, GARBAGE, BROKEN_SIGNAGE, CLUTTER_SIDEWALK, CONSTRUCTION_ROAD, FADED_SIGNAGE, BAD_BILLBOARD, SAND_ON_ROAD, UNKEPT_FACADE`) but ships only the dataset (90 images, CC BY 4.0), with **no trained model attached** — so no Serverless endpoint of the form `serverless.roboflow.com/smartathon-jqemg/{version}` is available. Use it only as a labelling reference, not as an endpoint.

### 1.3 Gap-filling models (loaded once at sidecar startup via Ultralytics)
| Smartathon class needed | Model (HF repo) | Architecture | Notes |
|---|---|---|---|
| graffiti | (no production object detector on HF; consider Roboflow Universe alternatives) | — | Treat as optional in v1; drop weight if absent. |
| faded / broken sign / bad billboard | `nezahatkorkmaz/traffic-sign-detection` (≈30k images, MIT) | YOLOv8 | "Sign present + low confidence" heuristic → "faded/broken" proxy. |
| pothole second opinion | `cazzz307/Pothole-Finetuned-YoloV8` (Apache 2.0; model card claims >95% accuracy on its internal dataset) | YOLOv8 | Run only when Roboflow confidence < 0.6 to control compute. |
| garbage / litter | `keremberke/yolov5m-garbage` | YOLOv5m | Higher recall than Roboflow on packaged trash. |
| unkempt façade | None production-ready | — | Document as a known limitation. |

### 1.4 Anonymization model (mandatory — runs FIRST in the sidecar)
- **Primary:** `Panoramax/detect_face_plate_sign` — YOLO11l trained on 2048-px imagery for Mapillary-style anonymization. Validation reported on model card: face P 0.724 / R 0.619 / mAP50 0.657; plate P 0.833 / R 0.849 / mAP50 0.889; sign P 0.879 / R 0.836 / mAP50 0.898. License: etalab-2.0. One model → both classes → fast.
- **Fallback A:** Meta `projectaria/EgoBlur` (Apache 2.0) — two TorchScript `.jit` files (`ego_blur_face.jit`, `ego_blur_lp.jit`) with a simple CLI; battle-tested by Meta's Aria team.
- **Fallback B:** `ORB-HD/deface` (pip-installable, OpenCV-based; faces only) + `morsetechlab/yolov11-license-plate-detection` for plates (note its model card warns of train/test contamination in the upstream dataset — treat reported metrics with caution).

**Why a project-owned anonymization step rather than relying on Google's blurring:** Google Street View already blurs at capture, but KVKK Article 5 (purpose limitation) plus the hackathon rules require demonstrating *our own* irreversible anonymization before any urban-object detector touches the bytes. We must log the blur step and store only blurred images.

---

## 2. Architecture & Data Flow

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────────┐
│ Next.js (Vercel)│         │  Go API (Render) │         │ Python CV sidecar  │
│  - Street picker│ HTTPS   │  - /score        │ HTTPS   │  (Render, FastAPI) │
│  - Heatmap      │ ──────► │  - /report       │ ──────► │  - /anonymize      │
│  - PDF/CSV      │ ◄────── │  - GSV fetch     │ ◄────── │  - /detect         │
│  (@react-pdf)   │  JSON   │  - URL signing   │  JSON   │  - calls Roboflow  │
└─────────────────┘         │  - aggregation   │         └─────────┬──────────┘
        ▲                   │  - scoring       │                   │
        │                   └──────────────────┘                   ▼ HTTPS
┌─────────────────┐                                     ┌────────────────────┐
│  Expo app (EAS) │ ────────── same /score ────────────►│  Roboflow Serverless│
└─────────────────┘                                     │ visual-pollution-   │
                                                        │ pc2as/9             │
                                                        └────────────────────┘
                                                              │
                                                              ▼
                                                   ┌────────────────────┐
                                                   │  Google Maps Platform│
                                                   │  Street View Static  │
                                                   │  + Roads (snapToRoads)│
                                                   └────────────────────┘
```

### 2.1 End-to-end request flow (street mode)
1. Next.js sends `{street}` → `POST /score` on the Go backend.
2. Go geocodes via Google Geocoding API, then calls `https://roads.googleapis.com/v1/snapToRoads?interpolate=true&path=...&key=...` to get up to 100 evenly-spaced lat/lng points (Google's hard cap is 100; their docs recommend consecutive points within 300 m for snap quality).
3. For each point, Go calls **Street View metadata** (`/maps/api/streetview/metadata?location=...`) to confirm imagery exists and capture pano_id + date. Skip ZERO_RESULTS.
4. Go fetches `https://maps.googleapis.com/maps/api/streetview?size=640x640&location={lat},{lng}&heading={h}&pitch=0&fov=90&key=...&signature=...` (max 640×640 per Google). Two headings per point (0° and 180°) → both sidewalks.
5. Go POSTs each image to sidecar `/anonymize` (multipart) → blurred PNG + JSON `{face_count, plate_count, image_sha256}`. Raw image **never persisted**; sidecar holds it in `BytesIO`.
6. Sidecar calls Roboflow: `POST https://serverless.roboflow.com/visual-pollution-pc2as/9?api_key=...` with body = base64(blurred image), `Content-Type: application/x-www-form-urlencoded`.
7. Sidecar runs gap-fill Ultralytics models on the same blurred image and merges detections.
8. Returns aggregated detections to Go.
9. Go applies the scoring formula (§4), returns `{score, grade, counts, perPointDetections, panoMetadata}`.
10. Next.js renders a Leaflet + `leaflet.heat` heatmap (weight = sum of class severities at point), per-class count chips, and a "Şikayet Dosyası İndir" button calling `@react-pdf/renderer`.

### 2.2 Where does CV run, and why
Go cannot natively load ONNX/PyTorch YOLO weights without large CGo bindings — building that in 6 hours is malpractice.

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Python FastAPI sidecar on Render** | Single language for all ML; can run Ultralytics if Roboflow rate-limits; hosts anonymizer + gap-fill detectors | Two Render services; ~30 s cold-start on free tier | ✅ **Chosen** — Go remains the API surface ("Backend: Go" rule). Sidecar is internal infrastructure. |
| B. Go calls Roboflow directly; no Python | Architecturally simpler | Cannot run the mandatory anonymization model inside Go | ❌ KVKK blocker |
| C. CV in Vercel Node functions | Co-located | Violates "Backend: Go" rule; no GPU | ❌ Rule violation |

Document this in README under "Architecture compliance": *Go remains the system of record / API gateway / scoring engine. The Python sidecar is an internal microservice called via service-to-service HTTPS with `INTERNAL_SIDECAR_TOKEN`.*

### 2.3 Expo app
Same backend. Expo `ImagePicker` → `POST /score/photo` (multipart) on Go → sidecar `/anonymize` → sidecar `/detect` → returns JSON to Expo, which renders the same `<ScoreCard/>` component (shared TypeScript types in `packages/shared-types/`).

---

## 3. Prerequisites / Setup Checklist (do BEFORE event start)

### Tier 0 — Accounts (≈30 min, night before)
1. **Google Cloud project** → enable billing (required even for free quota; Google has required billing on every Maps project since July 16, 2018) → enable **Maps JavaScript API**, **Street View Static API**, **Roads API**, **Geocoding API**. Create an API key + a **URL signing secret** in APIs & Services → Credentials. Apply restrictions: HTTP referrers for the frontend key, IP allowlist for the backend key. Set a daily quota under Quotas page as a budget guard.
2. **Roboflow account** (free Public plan) → Settings → API Key → copy *Private API Key*.
3. **Hugging Face account** → Settings → Access Tokens → create *fine-grained* token with `Inference > Make calls to Inference Providers` + repo read.
4. **Vercel account** linked to GitHub.
5. **Render.com account** with card on file (free tier spins down after 15 min idle).
6. **GitHub repo** `kaldirim-skoru` — *private during build*. Add `.gitignore` covering `*.jpg`, `*.png`, `raw_images/`, `.env*` **before first commit**.
7. **Expo / EAS account** → install Expo Go on phone, sign in.
8. **Cursor** — Pro tier, with Claude Opus model selected in the model picker.

### Tier 1 — CLIs and runtimes (≈20 min)
```bash
# Node 20 LTS (Next.js + Expo)
nvm install 20 && nvm use 20

# Go 1.22+
brew install go    # or https://go.dev/dl/

# Python 3.11 (sidecar)
brew install python@3.11

# Vercel, Render, Expo CLIs
npm i -g vercel eas-cli expo-cli

# Cursor CLI (mandatory for bonus AI-adaptation points)
# Per official cursor.com/blog/cli (Aug 7, 2025) the canonical install is:
curl https://cursor.com/install -fsSL | bash
agent --version     # verify the `agent` binary

# git, gh
brew install gh && gh auth login
```

### Tier 2 — Environment variables (pre-populate `.env.local` / Render dashboard)
```
# Google
GOOGLE_MAPS_API_KEY=AIza...                 # frontend (referrer-restricted)
GOOGLE_MAPS_BACKEND_KEY=AIza...             # Go backend (IP-restricted)
GOOGLE_MAPS_SIGNING_SECRET=...              # URL signing secret
# Roboflow
ROBOFLOW_API_KEY=...
ROBOFLOW_MODEL=visual-pollution-pc2as/9
# Hugging Face (for HF model downloads only)
HF_TOKEN=hf_...
# Internal
INTERNAL_SIDECAR_TOKEN=$(openssl rand -hex 32)
SIDECAR_URL=https://kaldirim-sidecar.onrender.com
# App
NEXT_PUBLIC_API_BASE=https://kaldirim-api.onrender.com
# Cursor CLI (for headless review in pre-commit hook)
CURSOR_API_KEY=...
```

### Tier 3 — Pre-download model weights (≈10 min)
```bash
mkdir -p sidecar/weights && cd sidecar/weights
huggingface-cli download Panoramax/detect_face_plate_sign --local-dir ./panoramax
huggingface-cli download keremberke/yolov5m-garbage     --local-dir ./garbage
huggingface-cli download nezahatkorkmaz/traffic-sign-detection --local-dir ./trafficsign
huggingface-cli download cazzz307/Pothole-Finetuned-YoloV8 --local-dir ./pothole
```
Store these as a Git LFS or Render disk artifact, **not** as repo files.

### Tier 4 — Repo scaffold (commit 1)
```
/apps
  /web        Next.js 14 App Router on Vercel
  /mobile     Expo (React Native)
/services
  /api        Go (chi) on Render
  /sidecar    Python FastAPI on Render
/packages
  /shared-types
.cursor/rules/   (mdc files, see §5)
AGENTS.md
CLAUDE.md
README.md
KVKK_COMPLIANCE.md
DATA_DELETION.md
```

---

## 4. Scoring Formula (defensible, transparent)

### 4.1 References anchoring the design
- **Walk Score methodology** (walkscore.com/methodology.shtml): *"Amenities within a 5 minute walk (.25 miles) are given maximum points. A decay function is used to give points to more distant amenities, with no points given after a 30 minute walk."* The published academic operationalization (e.g., arxiv.org/pdf/2212.05192) records the cutoff as 2,400 m. We borrow the **0–100 score with normalize-to-100 architecture** that jurors recognize.
- **MIT Place Pulse 2.0 / StreetScore** (Dubey, Naik, Parikh, Raskar, Hidalgo, ECCV 2016): 110,988 GSV images across 56 cities scored along 6 perceptual dimensions (safe, lively, boring, wealthy, depressing, beautiful) via 1.17 M pairwise comparisons. This validates *image-based 0–100 urban-quality scoring* as a peer-reviewed methodology — cite it in the README.
- **SDAIA Smartathon 2023** (Riyadh): canonical 11-class visual-pollution taxonomy framed as a *"visual pollution score/index"* — directly establishes class-weight precedent.

### 4.2 Formula
For each sampled point *p*, for each class *c* with confidence values *conf*:

```
ContributionPerPoint(p) = Σ_c  w_c · min(N_c(p), Cap_c) · conf̄_c(p)
```

Aggregate across all *P* sampled points on the street (sample density ~50 m → ≈ 20 panoramas per 1 km):

```
PollutionRaw = (Σ_p ContributionPerPoint(p)) / P     # mean per panorama
Score        = max(0, 100 − PollutionRaw)            # 0–100
Grade        = A if Score≥85, B≥70, C≥55, D≥40, E≥25, F otherwise
```

### 4.3 Class weights *w_c*
| Class | *w_c* | *Cap_c* | Rationale |
|---|---:|---:|---|
| pothole | 8 | 5 | Direct trip/fall hazard |
| culture sidewalk (clutter) | 7 | 8 | Directly blocks the kaldırım — core problem |
| construction debris / road | 7 | 5 | Blocks pedestrian path |
| garbage | 5 | 10 | Aesthetic + health, scales by count |
| broken signage | 4 | 4 | Wayfinding hazard |
| graffiti | 3 | 6 | Aesthetic |
| faded signage | 3 | 4 | Wayfinding minor |
| unkempt façade | 2 | 4 | Aesthetic |

Defense to jury: *"Weights mirror the Smartathon severity tiering and pedestrian-injury epidemiology; potholes and clutter cause physical harm, graffiti causes only aesthetic harm. All weights and caps are exposed in `scoring.config.json` and editable without code changes — meeting the 'transparent' and 'repeatable' criteria."*

### 4.4 Worked example
20-panorama street: 12 culture sidewalk (avg conf 0.7), 3 pothole (0.65), 5 garbage (0.55), 2 broken signage (0.6).
- culture sidewalk: 7 · min(12/20, 8) · 0.7 = 2.94
- pothole: 8 · min(3/20, 5) · 0.65 = 0.78
- garbage: 5 · min(5/20, 10) · 0.55 = 0.69
- broken signage: 4 · min(2/20, 4) · 0.6 = 0.24
- PollutionRaw ≈ 4.65 → **Score = 95.35 → Grade A**

Calibrate multipliers post-hoc on 2–3 hand-rated demo streets so a notoriously bad street lands at D/F.

---

## 5. Cursor CLI + `.cursor` Ruleset (for the 10-pt AI Adaptation bonus)

### 5.1 What Cursor CLI actually is (per cursor.com/blog/cli, Aug 7, 2025, authored by Lukas Möller, Ian Huang & Balta Ruiz)
*"You can now use Cursor Agent from the CLI or headless in any environment."* The binary is `agent`; install via `curl https://cursor.com/install -fsSL | bash`. The CLI reads `.cursor/rules/*.mdc`, `AGENTS.md`, and `CLAUDE.md` automatically and shares MCP servers + account credits with the desktop app. Non-interactive headless mode: `agent -p "<prompt>"` (with optional `--output-format json|text|stream-json`).

### 5.2 Concrete bonus-point integration plan
1. **README section "AI Tools Documentation"** — verbatim list:
   - Cursor IDE (Claude Opus, latest available in Cursor's model picker on event day) — interactive coding
   - Cursor CLI (`agent -p`) — headless review in Git hooks (below)
   - Cursor Background Agent — drafted the KVKK doc in parallel
   - Roboflow Workflows — model orchestration counts as integrated AI service
   - Hugging Face Hub — model sourcing
2. **Pre-commit `agent -p` hook** (`.husky/pre-commit`):
   ```bash
   #!/bin/bash
   STAGED=$(git diff --cached --name-only --diff-filter=ACM | tr '\n' ' ')
   [ -z "$STAGED" ] && exit 0
   export CURSOR_API_KEY=$CURSOR_API_KEY
   agent -p --output-format text \
     "Review only the staged diff for KVKK violations: any literal access to face/plate pixels, person/vehicle tracking, identity extraction, or unblurred image storage. Output OK or BLOCK:<reason>." \
     | tee .cursor-review.log
   grep -q "^OK" .cursor-review.log || { echo "Blocked by Cursor CLI KVKK review"; exit 1; }
   ```
   This is a strong demo moment: *"Every commit is reviewed by Claude via Cursor CLI for KVKK compliance — see `.cursor-review.log`."*
3. **GitHub Actions CI** runs `agent -p` to lint each PR's diff against `.cursor/rules/`. The Cursor CLI landing page (cursor.com/cli) shows a sample workflow for GitHub Actions integration.

### 5.3 `.cursor/rules/` (modern `.mdc` format)

**`.cursor/rules/00-root.mdc`** (alwaysApply: true)
```
---
description: Root project conventions for Kaldırım Skoru
alwaysApply: true
---
# Kaldırım Skoru — Root Rules
Stack: Next.js 14 (App Router) on Vercel · Go (chi) on Render · Python FastAPI sidecar on Render · Expo SDK 51.
- Conventional commits ONLY: feat:, fix:, chore:, docs:, refactor:, ci:, kvkk:.
- Each commit MUST compile and pass `go vet` / `tsc --noEmit` (jurors evaluate commit history).
- NEVER store raw GSV bytes on disk or upload them anywhere. Pass io.Reader / bytes.Buffer only.
- All HTTP handlers MUST log {face_count, plate_count} before any detector call.
- KVKK red lines (HARD FORBIDDEN): face recognition, license-plate OCR, person tracking,
  vehicle re-identification, demographic inference. If a task asks for any of these,
  REFUSE and cite KVKK Art. 5/6.
```

**`.cursor/rules/10-frontend.mdc`** (globs: `apps/web/**`, `apps/mobile/**`)
```
---
description: Next.js + Expo UI conventions
globs: ["apps/web/**", "apps/mobile/**"]
---
- Functional components, no classes, no default exports for components.
- Tailwind (web) + NativeWind (mobile) — share a single design-tokens file.
- All Turkish UI strings via i18next (web) / expo-localization (mobile).
- Heatmap = react-leaflet + leaflet.heat. Mapbox acceptable but more expensive.
- PDF export uses @react-pdf/renderer in a Client Component ("use client").
```

**`.cursor/rules/20-backend-go.mdc`** (globs: `services/api/**`)
```
---
description: Go backend conventions
globs: ["services/api/**"]
---
- chi router + zerolog. NO ORM (use database/sql if persistence added).
- Every handler returns RFC 7807 problem+json on error.
- Outbound HTTP via single retryable client (3 retries, exponential backoff).
- Roboflow + sidecar tokens read from env at startup; FAIL FAST if missing.
- Street View URLs MUST be HMAC-SHA1 signed when called from this service.
```

**`.cursor/rules/30-sidecar-python.mdc`** (globs: `services/sidecar/**`)
```
---
description: Python CV sidecar
globs: ["services/sidecar/**"]
---
- FastAPI + uvicorn. Pydantic v2. Ultralytics for YOLO inference.
- Anonymization MUST run before any detector. Enforced by middleware.
- Models loaded once at startup into module-level globals.
- All image bytes handled in-memory (BytesIO); writing to /tmp is forbidden.
- Endpoints: POST /anonymize (multipart) → image/png + JSON; POST /detect (multipart) → JSON.
```

**`.cursor/rules/40-kvkk.mdc`** (alwaysApply: true)
```
---
description: KVKK compliance hard rules
alwaysApply: true
---
- NO field, log line, or storage that contains face, plate, person, or vehicle identifiers.
- NO fine-tuning on GSV data (no derivative dataset creation).
- All raw images deleted at end of request; explicit nil + runtime.GC().
- Document any borderline decision in KVKK_COMPLIANCE.md before merging.
```

**`AGENTS.md`** (auto-read by Cursor CLI, Claude Code, GH Copilot):
```
This is a Turkish civic-tech hackathon project under KVKK constraints.
Before writing code, READ:
1. .cursor/rules/00-root.mdc
2. .cursor/rules/40-kvkk.mdc
3. KVKK_COMPLIANCE.md
When unsure, refuse and ask. Prefer small commits with meaningful messages.
```
**`CLAUDE.md`** → `@AGENTS.md` (import syntax).

---

## 6. Hour-by-Hour Build Schedule with Git Commit Plan

Target: ≥40 meaningful commits across 6 hours. Format: `feat(scope): subject` / `kvkk(scope): subject`.

### Hour 0:00 – 0:30  Scaffold + scoring contract
- 00:05 `chore: init monorepo, .gitignore, .cursor/rules, AGENTS.md, CLAUDE.md`
- 00:10 `chore(web): bootstrap Next.js 14 App Router + Tailwind`
- 00:15 `chore(api): scaffold Go service with chi + zerolog + /healthz`
- 00:20 `chore(sidecar): scaffold FastAPI + Dockerfile (python:3.11-slim + opencv-python-headless)`
- 00:25 `chore(mobile): bootstrap Expo SDK 51 with expo-router`
- 00:30 `feat(shared): define ScoreRequest/ScoreResponse zod + pydantic + Go structs`

### Hour 0:30 – 1:30  Street View pipeline + anonymization
- 00:40 `feat(api): /geocode endpoint using Google Geocoding API`
- 00:50 `feat(api): integrate Roads API snapToRoads, sample N=20 points`
- 01:00 `feat(api): fetch Street View metadata + signed Static images concurrently`
- 01:10 `feat(sidecar): load Panoramax/detect_face_plate_sign weights at startup`
- 01:20 `feat(sidecar): /anonymize endpoint — blur faces+plates, return PNG`
- 01:30 `kvkk(sidecar): structured log {face_count, plate_count, image_sha256} — never raw bytes`

### Hour 1:30 – 3:00  Detection + scoring
- 01:40 `feat(sidecar): /detect calling Roboflow visual-pollution-pc2as/9`
- 01:55 `feat(sidecar): merge gap-fill detectors (garbage, traffic-sign) into /detect`
- 02:10 `feat(api): /score orchestrator — fan out N images to sidecar, gather`
- 02:25 `feat(api): scoring.go — weighted-sum formula with JSON config`
- 02:40 `feat(api): /score returns {score, grade, counts, perPoint, panoramaDates}`
- 02:55 `test(api): table-driven test for scoring edge cases`
- 03:00 `docs(api): document scoring formula in README §Scoring`

### Hour 3:00 – 4:00  Web UI
- 03:15 `feat(web): /api/score Next.js route proxying to Go`
- 03:30 `feat(web): street search with debounced geocode preview`
- 03:45 `feat(web): react-leaflet map + leaflet.heat overlay`
- 04:00 `feat(web): ScoreCard (A–F grade pill + per-class chips)`

### Hour 4:00 – 4:45  Şikayet Dosyası (PDF/CSV)
- 04:15 `feat(web): @react-pdf/renderer ReportDocument — map screenshot, top-5 detections, formula breakdown, addressed to belediye`
- 04:30 `feat(web): CSV export via papaparse`
- 04:45 `feat(web): "Şikayet Dosyası İndir" button wired to PDF blob`

### Hour 4:45 – 5:30  Expo mobile flow
- 05:00 `feat(mobile): camera capture screen using expo-image-picker`
- 05:15 `feat(api): /score/photo accepts multipart upload`
- 05:30 `feat(mobile): result screen rendering shared ScoreCard`

### Hour 5:30 – 6:00  KVKK docs, demo polish, README, deploy
- 05:35 `kvkk(docs): DATA_DELETION.md signed commitment`
- 05:40 `docs(readme): final README with AI tools section, architecture, scoring formula, KVKK section`
- 05:45 `chore: deploy api+sidecar to Render, web to Vercel, EAS preview build`
- 05:50 `feat(api): /admin/wipe (POST, internal token) for end-of-event purge`
- 05:55 `chore: tag v1.0.0-demo`
- 06:00 Live demo

**Notes on the rule "commit-by-commit, no single dump":**
- Push at least 6 commits per hour. Never amend or force-push the demo branch.
- Each commit message should be ≤ 72 chars subject + (optional) body explaining the *why*. The jury reads `git log --oneline` first.

---

## 7. KVKK Compliance Implementation

### 7.1 Codified hard rules (in `.cursor/rules/40-kvkk.mdc` and tested in CI)
1. **Order of operations enforced in code**: sidecar middleware `@requires_anonymization` rejects `/detect` calls whose body lacks an anonymization receipt hash from a prior `/anonymize` call within 60 s.
2. **No identity classes**: merged class list is hard-coded `{pothole, garbage, construction_road, culture_sidewalk, broken_signage, faded_signage, graffiti, unkempt_facade}`. Any other class from an upstream model is silently dropped at the sidecar boundary.
3. **No raw-image persistence**: Go uses `bytes.NewReader` + `http.NewRequest`, deferring `req.Body.Close()` immediately; no temp files; no log statement ever takes `req.Body` as an argument.
4. **No public bucket**: no S3/GCS bucket exists in the architecture.
5. **`/admin/wipe`** triggers `runtime.GC()` and clears in-memory caches; invoked at end of demo.

### 7.2 `DATA_DELETION.md` template (Turkish + English, ready to commit)
```markdown
# Veri Silme Taahhüdü / Data Deletion Commitment

## 1. Proje
Kaldırım Skoru, [Hackathon Adı], [Tarih]

## 2. Veri Sorumlusu / Data Controller
[Developer Name], iletişim: [email]

## 3. İşlenen Veri Kategorisi
Google Street View Static API üzerinden geçici olarak alınan, ham
(anonimleştirilmemiş) sokak görüntüleri. Sadece RAM'de tutulur, kalıcı diske
veya buluta yazılmaz.

## 4. İşleme Amacı (KVKK Madde 5 — Amaç Sınırlaması)
Yalnızca kentsel nesneler (kaldırım işgali, çöp, çukur, tabela, grafiti) tespiti.
Hiçbir koşulda kişi tanıma, plaka okuma, kişi/araç takibi yapılmaz.

## 5. Anonimleştirme
Her ham görüntü Panoramax/detect_face_plate_sign (YOLO11l) modeli ile
yüz ve plakaları geri-dönülemez şekilde bulanıklaştırıldıktan sonra detektöre
verilir. Log: { face_count, plate_count, image_sha256 }. Ham byte loglanmaz.

## 6. Saklama Süresi
- Ham görüntüler: 0 saniye (istek süresince bellek içi).
- Bulanıklaştırılmış görüntüler: oturum süresince (≤ 6 saat), sonra silinir.
- Tespit metadataları (sayım + skor): proje sonunda silinir.

## 7. Silme Taahhüdü
Etkinlik sonunda (en geç [Tarih] 23:59 TRT) tüm görüntü, tespit ve log
dosyaları geri dönülemez şekilde silinecektir:
- Render hizmetleri silinir.
- Vercel deployment silinir.
- GitHub repo private kalır; eğer görüntü committenmiş ise
  `git filter-repo --invert-paths --path raw_images/` ile geçmişten temizlenir.
- Roboflow workspace'inde paylaşılan datasete görüntü yüklenmemiştir.

## 8. İmza
[Developer Name] — [Date] — Git commit SHA: [hash]
```

---

## 8. Risk Mitigation & Fallbacks

### 8.1 Domain gap (Saudi training data → Istanbul)
**Risk:** Smartathon-derived models were trained on Riyadh imagery; Istanbul has minarets, dense apartment blocks, narrow cobble streets — distribution shift will hurt mAP from the already-modest 57.3%.
**Mitigations:**
1. **Pre-event sanity check (Tier 3 step):** Run the Roboflow endpoint on 5 hand-picked Istanbul GSV panoramas (Beyoğlu, Kadıköy, Fatih, residential side street, known-bad alley). Record confidence distributions in `tests/istanbul-baseline.json`. If any class collapses to zero, drop its per-class confidence threshold to 0.25.
2. **Show your work to the jury:** admit the domain gap in README → "Limitations". Intellectual honesty earns trust.
3. **Live calibration knob:** expose `confidence_threshold` per class in JSON config for demo-time tuning.

### 8.2 GSV image freshness varies
**Risk:** Metadata might return imagery from 2014.
**Mitigations:**
1. Always fetch `/metadata` first; display `pano_date` in the UI ("Görüntü tarihi: 2019-06").
2. If `pano_date < 3 years ago`, badge "GÜNCEL DEĞİL — yerinde fotoğraf çekin" with a deep link to the Expo capture flow.
3. If a point returns no detections at 2 headings, try 4 headings (0°/90°/180°/270°).

### 8.3 Roboflow rate limit / outage
**Mitigation:** Python sidecar already has Ultralytics models loaded locally. On 3× consecutive 429/5xx, fail-over to `keremberke/yolov5m-garbage` + `cazzz307/Pothole-Finetuned-YoloV8` on CPU. Roboflow's published v1 Serverless API ingest limit is 5 MB per image — preemptively resize >5 MB images to 1280×1280 in Go.

### 8.4 Google quota
**Mitigation:** cap N=20 panoramas/street; cache `(lat,lng,heading) → image` in Redis (Render add-on, 25 MB free) keyed by SHA-256(URL). Always sign URLs to use the higher signed quota. Per Google's billing page (developers.google.com/maps/documentation/streetview/usage-and-billing, last updated 2026-05-29), Street View Static pricing is *"$0.007 to $0.0056 per panorama based on volume"* and the *"monthly $200 credit until March 1, 2025"* has been replaced with *"a free usage threshold per API"* — the Street View Static API is in the Pro tier, which gets ~5,000 free events/month before billing kicks in. Confirm whether the hackathon's "10,000 free requests" figure refers to event-provided promotional credit on top of this.

### 8.5 Render free-tier cold start (~30 s)
**Mitigation:** hit `/healthz` on both services 60 s before live demo (curl from phone during intro slide).

### 8.6 KVKK red lines — hard "do not" list
- Do not train any model on GSV imagery (creates a derivative dataset that may contain identifiable people).
- Do not run OCR over license plates anywhere in the codebase — even for testing.
- Do not call any person/pedestrian/vehicle detection model on the blurred images (would imply tracking).
- Do not save panorama IDs joined with face/plate counts — that combination could be reverse-engineered into a tracking dataset.
- Do not include any sample image in the GitHub repo, even blurred (Article 6 special-category-data risk if a face slips through).

### 8.7 Sanity-check protocol (run at 5:30)
- [ ] `curl /healthz` returns 200 from both Go and sidecar.
- [ ] `curl /score?street=İstiklal Caddesi` returns valid JSON in <20 s.
- [ ] Anonymization log shows `face_count>=0, plate_count>=0` for ≥3 panoramas.
- [ ] PDF download includes formula breakdown + map snapshot.
- [ ] Expo Go app on phone successfully scores a photo.
- [ ] `git ls-files` shows no `*.jpg`/`*.png` files (except logo assets).
- [ ] `DATA_DELETION.md` signed and committed.

---

## Recommendations (decision-ready)

1. **Commit to Roboflow as the primary CV provider** — the integration is 1 HTTPS POST. Use HF only for self-hosted models in the sidecar. **Re-evaluate** if Roboflow latency exceeds 3 s/image during your Tier-3 sanity check, in which case fall back to running everything in the sidecar with local Ultralytics weights.
2. **Build the anonymization step FIRST, even before the detector** — KVKK is worth 10 points and a single screenshot of leaked face/plate pixels in your demo will eliminate the project. Implement `/anonymize` before `/detect`, enforce ordering via middleware, and demonstrate the receipt-hash chain in the demo.
3. **Wire Cursor CLI into the pre-commit hook on commit #1** — this gives the jury a tangible "AI-adaptation" artifact (`.cursor-review.log`) plus reproducible commit history. The 10-pt AI Adaptation bucket is the easiest to max out.
4. **Treat the scoring formula as the project's "thesis"** — commit `scoring.config.json` with explicit weights and Walk Score / Place Pulse citations in the README. Jurors evaluating the 20-pt Public Benefit bucket will reward visible methodology.
5. **Budget tripwires:** if at the 3:30 mark scoring still doesn't work end-to-end, **drop graffiti + unkempt façade** (lowest-weight classes, hardest to detect) and ship with 6 classes. A working demo with 6 classes scores higher than a broken demo with 8.
6. **Demo script:** open with a famously bad Istanbul street → live D/F grade with heatmap → swipe to Expo phone → photograph a different street → same score component → download Şikayet Dosyası PDF → show the KVKK section + `.cursor-review.log`. 90 seconds, four scoring buckets touched.

## Caveats
- Some Cursor pricing/version claims come from third-party guides (e.g., DeployHQ) — treat as approximate; the official source of truth is `cursor.com/docs/cli/installation`. The exact Claude model identifier ("Opus 4.8" per the user's task) should be re-checked in Cursor's model picker the day of the event.
- The hackathon's "10,000 free Street View requests" likely refers to **event-provided promotional credit**, not Google's standard 2026 pricing — Google's actual SKU pricing is per-panorama with a "Pro-tier" monthly free-event threshold (≈5,000 events). Confirm at event registration.
- No single Roboflow Universe model covers all 11 Smartathon classes; the primary recommendation (`visual-pollution-pc2as/9`) covers 5. Graffiti / faded sign / unkempt façade are gap-filled imperfectly — be honest about this in the README "Limitations" section.
- mAP@50 = 57.3% on the primary Roboflow model implies real-world recall on out-of-domain Istanbul imagery will be lower. Calibrate the scoring weights so the demo street lands in the C–D band, not F — an F-graded demo street looks broken rather than insightful.
- Reported >95% accuracy on `cazzz307/Pothole-Finetuned-YoloV8` is the model author's claim on its HF card; treat as an upper bound and validate against your Istanbul baseline panoramas before relying on it.
- `morsetechlab/yolov11-license-plate-detection`'s model card explicitly warns of train/test contamination in its upstream dataset ("Metrics are inflated") — prefer `Panoramax/detect_face_plate_sign` as the primary plate detector for that reason.