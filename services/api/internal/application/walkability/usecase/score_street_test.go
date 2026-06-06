package usecase

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/masterfabric-go/masterfabric/internal/application/walkability/dto"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// fakeSV is a network-free StreetViewProvider that records whether Geocode ran
// and which points imagery was requested for. It returns no coverage so the
// pipeline produces coordinate-only points (no detector calls needed).
type fakeSV struct {
	geocodeCalled bool
	geocodeArg    string
	geocodeResult model.GeoPoint
	fetchedPoints []model.GeoPoint
}

func (f *fakeSV) Geocode(_ context.Context, address string) (model.GeoPoint, error) {
	f.geocodeCalled = true
	f.geocodeArg = address
	return f.geocodeResult, nil
}

func (f *fakeSV) ReverseGeocode(_ context.Context, lat, lng float64) (string, string, error) {
	return "Test Sokak", "test-sokak", nil
}

func (f *fakeSV) SnapToRoads(_ context.Context, _ []model.GeoPoint) ([]model.GeoPoint, error) {
	return nil, nil // empty → use case falls back to the seed path (no network)
}

func (f *fakeSV) FetchPanorama(_ context.Context, p model.GeoPoint, _ int) (*repository.StreetImagery, error) {
	f.fetchedPoints = append(f.fetchedPoints, p)
	return nil, nil // ZERO_RESULTS → no imagery, no detector call
}

// fakeDetector records calls; it must never be hit when there is no imagery.
type fakeDetector struct {
	anonymizeCalls  int
	preBlurredCalls int
}

func (f *fakeDetector) AnonymizeAndDetect(_ context.Context, _ []byte, _ string) (*repository.DetectionResult, error) {
	f.anonymizeCalls++
	return &repository.DetectionResult{}, nil
}

func (f *fakeDetector) DetectPreBlurred(_ context.Context, _ []byte, _ string) (*repository.DetectionResult, error) {
	f.preBlurredCalls++
	return &repository.DetectionResult{}, nil
}

func newUC(sv repository.StreetViewProvider, det repository.Detector) *ScoreStreetUseCase {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	return NewScoreStreetUseCase(sv, det, model.DefaultScoringConfig(), log, 20)
}

func ptr(f float64) *float64 { return &f }

func TestExecute_LatLngSkipsGeocode(t *testing.T) {
	sv := &fakeSV{}
	uc := newUC(sv, &fakeDetector{})

	lat, lng := 41.0082, 28.9784 // Sultanahmet-ish
	got, err := uc.Execute(context.Background(), dto.ScoreStreetRequest{
		Street:  "İstiklal Caddesi",
		Lat:     ptr(lat),
		Lng:     ptr(lng),
		PlaceID: "ChIJsome",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sv.geocodeCalled {
		t.Errorf("Geocode was called but lat/lng were provided; geocoding must be skipped")
	}
	// The supplied coordinate must be used as the snapToRoads seed center.
	var seeded bool
	for _, p := range sv.fetchedPoints {
		if p.Lat == lat && p.Lng == lng {
			seeded = true
			break
		}
	}
	if !seeded {
		t.Errorf("supplied (lat,lng) was not used as a seed point; fetched=%v", sv.fetchedPoints)
	}
	// Query label prefers the human-readable street when present.
	if got.Query != "İstiklal Caddesi" {
		t.Errorf("query = %q, want street label", got.Query)
	}
}

func TestExecute_NoStreetUsesCoordinateLabel(t *testing.T) {
	sv := &fakeSV{}
	uc := newUC(sv, &fakeDetector{})

	got, err := uc.Execute(context.Background(), dto.ScoreStreetRequest{
		Lat: ptr(41.01), Lng: ptr(28.98),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sv.geocodeCalled {
		t.Errorf("Geocode must be skipped when coordinates are supplied")
	}
	if got.Query == "" {
		t.Errorf("query label should fall back to coordinates, got empty")
	}
}

func TestExecute_StreetOnlyGeocodes(t *testing.T) {
	sv := &fakeSV{geocodeResult: model.GeoPoint{Lat: 41.0, Lng: 29.0}}
	uc := newUC(sv, &fakeDetector{})

	_, err := uc.Execute(context.Background(), dto.ScoreStreetRequest{Street: "Bağdat Caddesi"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !sv.geocodeCalled {
		t.Errorf("Geocode must run when only street is provided")
	}
	if sv.geocodeArg != "Bağdat Caddesi" {
		t.Errorf("geocoded %q, want trimmed street", sv.geocodeArg)
	}
}

func TestExecute_NeitherStreetNorCoords_BadRequest(t *testing.T) {
	sv := &fakeSV{}
	uc := newUC(sv, &fakeDetector{})

	_, err := uc.Execute(context.Background(), dto.ScoreStreetRequest{})
	if err == nil {
		t.Fatal("expected an error when neither street nor lat/lng is provided")
	}
	if !errors.Is(err, domainErr.ErrBadRequest) {
		t.Errorf("error = %v, want ErrBadRequest", err)
	}
	if sv.geocodeCalled {
		t.Errorf("Geocode must not run when no street is provided")
	}
}

func TestExecute_OutOfRangeLatLng_BadRequest(t *testing.T) {
	sv := &fakeSV{}
	uc := newUC(sv, &fakeDetector{})

	_, err := uc.Execute(context.Background(), dto.ScoreStreetRequest{
		Lat: ptr(200.0), Lng: ptr(28.0), // lat out of [-90,90]
	})
	if err == nil {
		t.Fatal("expected an error for out-of-range lat/lng")
	}
	if !errors.Is(err, domainErr.ErrBadRequest) {
		t.Errorf("error = %v, want ErrBadRequest", err)
	}
}
