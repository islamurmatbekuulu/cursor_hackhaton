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
}

// Detector abstracts the Python CV sidecar. Implementations MUST anonymize
// (face/plate blur) before running any object detector, and return only the
// allowlisted urban-object classes.
type Detector interface {
	// AnonymizeAndDetect blurs faces/plates in-memory, then detects urban
	// objects on the blurred bytes and returns the merged detections.
	AnonymizeAndDetect(ctx context.Context, image []byte, mimeType string) (*DetectionResult, error)
}
