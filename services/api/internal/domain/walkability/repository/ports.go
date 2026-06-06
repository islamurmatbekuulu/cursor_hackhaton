// Package repository declares the outbound ports (interfaces) for the
// walkability bounded context. Infrastructure adapters implement these; the
// application layer depends only on these interfaces (hexagonal architecture).
package repository

import (
	"context"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
)

// StreetImagery is a fetched (still raw, in-memory) Street View frame plus the
// metadata required for the UI. The raw bytes are never persisted.
type StreetImagery struct {
	Point    model.GeoPoint
	Heading  int
	PanoID   string
	PanoDate string
	Image    []byte
	MimeType string
}

// StreetViewProvider abstracts Google Maps Platform: Geocoding, Roads
// (snapToRoads) and Street View metadata + Static image fetching.
type StreetViewProvider interface {
	// Geocode resolves a free-text address/street to a coordinate.
	Geocode(ctx context.Context, address string) (model.GeoPoint, error)
	// ReverseGeocode resolves coordinates to a human-readable street label for
	// mobile submissions (Geocoding API, language=tr).
	ReverseGeocode(ctx context.Context, lat, lng float64) (streetLabel, streetLabelKey string, err error)
	// SnapToRoads aligns a rough path to road geometry and interpolates evenly
	// spaced points (Google caps the result at 100 points).
	SnapToRoads(ctx context.Context, path []model.GeoPoint) ([]model.GeoPoint, error)
	// FetchPanorama returns imagery for a point/heading, or (nil, nil) when no
	// Street View coverage exists at that location (ZERO_RESULTS).
	FetchPanorama(ctx context.Context, p model.GeoPoint, heading int) (*StreetImagery, error)
}

// DetectionResult is the outcome of the anonymize→detect pipeline for one image.
//
// FaceCount/PlateCount/ImageSHA256 form the KVKK anonymization receipt; callers
// log them but MUST NOT persist them joined to a panorama ID.
type DetectionResult struct {
	Detections  []model.Detection
	FaceCount   int
	PlateCount  int
	ImageSHA256 string
	// BlurredPNG is the anonymized PNG from /anonymize (user-photo path only).
	// Request-scoped; callers may persist this for municipality review but MUST
	// never store raw uploads. Nil for DetectPreBlurred (Street View path).
	BlurredPNG []byte
}

// Detector abstracts the Python CV sidecar. Implementations return only the
// allowlisted urban-object classes (never person/vehicle/face/plate data).
//
// Two entry points exist by design, reflecting the source of the imagery:
//
//   - AnonymizeAndDetect: for user-uploaded photos that are NOT pre-anonymized.
//     Implementations MUST blur faces/plates in-memory BEFORE detection and the
//     sidecar enforces a receipt gate. Used by ScorePhotoUseCase.
//   - DetectPreBlurred: for imagery already anonymized at the source. Google
//     Street View blurs faces/plates before publishing, so re-blurring is
//     redundant and slow; this path skips the local blur and detects directly.
//     Used by ScoreStreetUseCase. See KVKK_COMPLIANCE.md §5 for the justification
//     and residual-risk acknowledgment.
type Detector interface {
	// AnonymizeAndDetect blurs faces/plates in-memory, then detects urban
	// objects on the blurred bytes and returns the merged detections.
	AnonymizeAndDetect(ctx context.Context, image []byte, mimeType string) (*DetectionResult, error)
	// DetectPreBlurred detects urban objects on imagery that is ALREADY
	// anonymized at the source (e.g. Google Street View). It skips the local
	// anonymize step and asserts the pre-blurred source to the sidecar. It does
	// NOT add any face/plate/person/vehicle processing — it only omits a blur
	// step that the source already performed. FaceCount/PlateCount are 0 (not
	// applicable); ImageSHA256 is still computed for auditability.
	DetectPreBlurred(ctx context.Context, image []byte, mimeType string) (*DetectionResult, error)
}

// AnonymizeResult is the blurred PNG plus the KVKK anonymization receipt for a
// single user-uploaded image.
//
// BlurredPNG is the ONLY representation of the image that may leave the
// anonymize boundary: raw upload bytes are discarded before this is returned.
// FaceCount/PlateCount/ImageSHA256 form the receipt that callers MUST log
// before sending BlurredPNG to any downstream processor (e.g. the LLM scorer).
type AnonymizeResult struct {
	BlurredPNG  []byte
	FaceCount   int
	PlateCount  int
	ImageSHA256 string
}

// Anonymizer blurs faces + license plates in-memory and returns the blurred PNG
// plus the anonymization receipt. It performs NO urban-object detection and NO
// identification of any kind. This is the mandatory FIRST step for user-uploaded
// photos (KVKK Art. 5/6): only the returned BlurredPNG may be forwarded onward.
type Anonymizer interface {
	Anonymize(ctx context.Context, image []byte, mimeType string) (*AnonymizeResult, error)
}

// ScoredCategory is one visual-pollution category the Scorer observed in an
// image. Class is a canonical allowlist key (see model.AllowedClasses); Severity
// is a 0..1 magnitude. It carries NO bounding boxes and NO identifying content.
type ScoredCategory struct {
	Class    string
	Severity float64
}

// ImageScore is the visual-pollution assessment of a single ANONYMIZED image,
// produced by an LLM vision model (Claude) rather than an object detector.
//
// KVKK: it contains ONLY a walkability score, an A–F grade, allowlisted
// pollution categories, and a Turkish report. It MUST NOT carry any
// person/vehicle/face/plate identifier; the Scorer discards any such content.
type ImageScore struct {
	Score      float64
	Grade      model.Grade
	Categories []ScoredCategory
	ReportTR   string
}

// Scorer assesses sidewalk / urban visual-pollution conditions on an image that
// has ALREADY been anonymized (faces + plates blurred).
//
// KVKK contract for implementations:
//   - The input MUST be the blurred PNG only; raw uploads are never passed here.
//   - The model is instructed to assess ONLY visual-pollution conditions and to
//     NOT identify people, read plates/identifying text, or perform face/plate
//     OCR or person/vehicle tracking.
//   - Implementations keep ONLY score/grade/categories/report and discard any
//     identifying content the model might return. See KVKK_COMPLIANCE.md §5.4.
type Scorer interface {
	ScoreImage(ctx context.Context, blurredPNG []byte) (*ImageScore, error)
}
