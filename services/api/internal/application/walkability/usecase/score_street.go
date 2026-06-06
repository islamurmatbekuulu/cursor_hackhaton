// Package usecase orchestrates the Kaldırım Skoru scoring flows. It depends only
// on domain ports (StreetViewProvider, Detector) and the pure scoring service —
// never on concrete infrastructure.
//
// DEPRECATED product path: ScoreStreetUseCase (Google Street View) is no longer
// invoked by HTTP — POST /api/v1/score returns 410 Gone. Mobile photo submissions
// are the primary flow. Code retained for juror git history.
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/masterfabric-go/masterfabric/internal/application/walkability/dto"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/service"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// headings sampled per point: 0° and 180° capture both sidewalks (PLAYBOOK §2.1).
var defaultHeadings = []int{0, 180}

// maxConcurrentImages bounds in-flight sidecar calls to avoid hammering the
// free-tier CV service.
const maxConcurrentImages = 4

// ScoreStreetUseCase scores a named street using Google Street View imagery
// analyzed by the CV sidecar. Street View imagery is face/plate-blurred at the
// source by Google, so this flow detects on the pre-blurred bytes directly
// (no local re-blur); see scorePoint and KVKK_COMPLIANCE.md §5.
type ScoreStreetUseCase struct {
	sv        repository.StreetViewProvider
	detector  repository.Detector
	cfg       model.ScoringConfig
	log       *slog.Logger
	maxPoints int
}

// NewScoreStreetUseCase wires the use case. maxPoints defaults to 20 if <= 0.
func NewScoreStreetUseCase(
	sv repository.StreetViewProvider,
	detector repository.Detector,
	cfg model.ScoringConfig,
	log *slog.Logger,
	maxPoints int,
) *ScoreStreetUseCase {
	if maxPoints <= 0 {
		maxPoints = 20
	}
	return &ScoreStreetUseCase{sv: sv, detector: detector, cfg: cfg, log: log, maxPoints: maxPoints}
}

// Execute runs the full street-scoring pipeline.
func (uc *ScoreStreetUseCase) Execute(ctx context.Context, req dto.ScoreStreetRequest) (*model.StreetScore, error) {
	maxPoints := uc.maxPoints
	if req.MaxPoints > 0 && req.MaxPoints < maxPoints {
		maxPoints = req.MaxPoints
	}

	origin, label, err := uc.resolveOrigin(ctx, req)
	if err != nil {
		return nil, err
	}

	// Build a short seed segment around the seed point and snap it to roads.
	seed := seedPath(origin, 6, 0.0004) // ~6 points spanning ~250 m
	snapped, err := uc.sv.SnapToRoads(ctx, seed)
	if err != nil || len(snapped) == 0 {
		uc.log.Warn("snapToRoads unavailable, sampling around seed point", "error", err)
		snapped = seed
	}
	sampled := samplePoints(snapped, maxPoints)

	results := uc.fanOut(ctx, sampled)

	summary := service.Score(uc.cfg, results)
	summary.Query = label
	summary.Points = results
	summary.PanoramaDates = collectDates(results)
	summary.Limitations = limitations(results)
	return &summary, nil
}

// resolveOrigin determines the snapToRoads seed coordinate plus a human-readable
// query label. When the request carries a usable (Lat,Lng) pair — e.g. from
// Google Places Autocomplete — geocoding is SKIPPED and the coordinate is used
// directly. Otherwise the free-text Street is geocoded. If neither a usable
// Street nor coordinates are supplied, a 400-class domain error is returned.
func (uc *ScoreStreetUseCase) resolveOrigin(ctx context.Context, req dto.ScoreStreetRequest) (model.GeoPoint, string, error) {
	if req.HasCoordinates() {
		lat, lng := *req.Lat, *req.Lng
		if !validLatLng(lat, lng) {
			return model.GeoPoint{}, "", domainErr.New(domainErr.ErrBadRequest, "lat/lng out of range", nil)
		}
		// place_id is logged for diagnostics only; the coordinate is authoritative.
		uc.log.Info("scoring with client coordinates (geocode skipped)",
			"lat", lat, "lng", lng, "place_id", req.PlaceID)
		label := strings.TrimSpace(req.Street)
		if label == "" {
			label = fmt.Sprintf("%.5f,%.5f", lat, lng)
		}
		return model.GeoPoint{Lat: lat, Lng: lng}, label, nil
	}

	street := strings.TrimSpace(req.Street)
	if len(street) < 2 {
		return model.GeoPoint{}, "", domainErr.New(domainErr.ErrBadRequest, "either 'street' or both 'lat' and 'lng' are required", nil)
	}
	origin, err := uc.sv.Geocode(ctx, street)
	if err != nil {
		return model.GeoPoint{}, "", domainErr.New(domainErr.ErrBadRequest, "could not geocode street", err)
	}
	return origin, street, nil
}

// validLatLng bounds a WGS84 coordinate to valid ranges.
func validLatLng(lat, lng float64) bool {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

// fanOut fetches + analyzes imagery for each sampled point concurrently (bounded).
func (uc *ScoreStreetUseCase) fanOut(ctx context.Context, points []model.GeoPoint) []model.PointResult {
	results := make([]model.PointResult, len(points))
	sem := make(chan struct{}, maxConcurrentImages)
	var wg sync.WaitGroup

	for i, p := range points {
		wg.Add(1)
		go func(idx int, pt model.GeoPoint) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[idx] = uc.scorePoint(ctx, pt)
		}(i, p)
	}
	wg.Wait()

	// Drop points that produced no imagery at all (keep coordinate-only points out).
	out := make([]model.PointResult, 0, len(results))
	for _, r := range results {
		if r.PanoID != "" || len(r.Detections) > 0 || len(r.Headings) > 0 {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		// Keep coordinates so the map still renders something meaningful.
		for _, p := range points {
			out = append(out, model.PointResult{Point: p})
		}
	}
	return out
}

// scorePoint fetches both headings for a point and detects urban objects.
//
// Street View imagery is already face/plate-blurred at the source by Google
// before publishing, so this path SKIPS the local /anonymize blur step (it is
// redundant and adds ~60s/scan) and sends the pre-blurred bytes straight to
// detection via DetectPreBlurred. User-uploaded photos are NOT pre-anonymized
// and keep the full anonymize→detect flow (see ScorePhotoUseCase).
// KVKK justification + residual-risk acknowledgment: see KVKK_COMPLIANCE.md §5.
func (uc *ScoreStreetUseCase) scorePoint(ctx context.Context, pt model.GeoPoint) model.PointResult {
	res := model.PointResult{Point: pt}
	for _, h := range defaultHeadings {
		img, err := uc.sv.FetchPanorama(ctx, pt, h)
		if err != nil {
			uc.log.Warn("street view fetch failed", "lat", pt.Lat, "lng", pt.Lng, "heading", h, "error", err)
			continue
		}
		if img == nil {
			continue // ZERO_RESULTS at this heading
		}
		res.PanoID = img.PanoID
		res.PanoDate = img.PanoDate
		res.Headings = append(res.Headings, h)

		det, err := uc.detector.DetectPreBlurred(ctx, img.Image, img.MimeType)
		// Release raw bytes immediately (KVKK: no raw retention).
		img.Image = nil
		if err != nil {
			uc.log.Warn("street view detect failed", "heading", h, "error", err)
			continue
		}
		res.Detections = append(res.Detections, det.Detections...)
	}
	res.Weight = service.PointWeight(uc.cfg, res.Detections)
	return res
}

// seedPath builds a north–south line of points centered on origin.
func seedPath(origin model.GeoPoint, n int, stepDeg float64) []model.GeoPoint {
	if n < 2 {
		n = 2
	}
	half := n / 2
	path := make([]model.GeoPoint, 0, n)
	for i := -half; i <= half; i++ {
		path = append(path, model.GeoPoint{Lat: origin.Lat + float64(i)*stepDeg, Lng: origin.Lng})
	}
	return path
}

// samplePoints returns up to maxPoints evenly spaced points from the path.
func samplePoints(path []model.GeoPoint, maxPoints int) []model.GeoPoint {
	if maxPoints <= 0 {
		maxPoints = 20
	}
	if len(path) <= maxPoints {
		return path
	}
	step := float64(len(path)) / float64(maxPoints)
	out := make([]model.GeoPoint, 0, maxPoints)
	for i := 0; i < maxPoints; i++ {
		idx := int(float64(i) * step)
		if idx >= len(path) {
			idx = len(path) - 1
		}
		out = append(out, path[idx])
	}
	return out
}

func collectDates(results []model.PointResult) []string {
	seen := map[string]struct{}{}
	var dates []string
	for _, r := range results {
		if r.PanoDate == "" {
			continue
		}
		if _, ok := seen[r.PanoDate]; ok {
			continue
		}
		seen[r.PanoDate] = struct{}{}
		dates = append(dates, r.PanoDate)
	}
	return dates
}

// limitations surfaces honest caveats for the UI (PLAYBOOK §8.1/§8.2).
func limitations(results []model.PointResult) []string {
	var withImagery int
	for _, r := range results {
		if len(r.Headings) > 0 {
			withImagery++
		}
	}
	var notes []string
	if withImagery == 0 {
		notes = append(notes, "Bu konum için Street View görüntüsü bulunamadı; skor yalnızca örnek noktalara dayanır.")
	}
	notes = append(notes,
		"Tespit modeli Smartathon (Riyad) verisiyle eğitildi; İstanbul için alan uyumu sınırlıdır.",
		"Skor 5 birincil sınıf + boşluk-doldurucu sınıflar üzerinden hesaplanır; grafiti/yıpranmış cephe eksik olabilir.",
	)
	return notes
}
