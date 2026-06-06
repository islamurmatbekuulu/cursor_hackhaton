package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/masterfabric-go/masterfabric/internal/application/walkability/dto"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/service"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// ScorePhotoInput is the in-memory payload for a mobile photo score request.
type ScorePhotoInput struct {
	Image    []byte
	MimeType string
	Lat      *float64
	Lng      *float64
	Accuracy *float64
}

// ScorePhotoUseCase scores a single user-captured photo (Expo capture flow).
type ScorePhotoUseCase struct {
	detector repository.Detector
	geocoder repository.StreetViewProvider
	repo     repository.SubmissionRepository
	cfg      model.ScoringConfig
	log      *slog.Logger
}

// NewScorePhotoUseCase wires the photo scoring use case.
func NewScorePhotoUseCase(
	detector repository.Detector,
	geocoder repository.StreetViewProvider,
	repo repository.SubmissionRepository,
	cfg model.ScoringConfig,
	log *slog.Logger,
) *ScorePhotoUseCase {
	return &ScorePhotoUseCase{
		detector: detector,
		geocoder: geocoder,
		repo:     repo,
		cfg:      cfg,
		log:      log,
	}
}

// Execute anonymizes + detects on the uploaded image and returns score + persistence metadata.
func (uc *ScorePhotoUseCase) Execute(ctx context.Context, in ScorePhotoInput) (*dto.ScorePhotoResponse, error) {
	if len(in.Image) == 0 {
		return nil, domainErr.New(domainErr.ErrBadRequest, "empty image upload", nil)
	}

	det, err := uc.detector.AnonymizeAndDetect(ctx, in.Image, in.MimeType)
	in.Image = nil
	if err != nil {
		return nil, domainErr.New(domainErr.ErrInternal, "anonymize+detect failed", err)
	}

	point := model.PointResult{
		Detections: det.Detections,
		Weight:     service.PointWeight(uc.cfg, det.Detections),
	}
	if in.Lat != nil && in.Lng != nil {
		point.Point = model.GeoPoint{Lat: *in.Lat, Lng: *in.Lng}
	}

	summary := service.Score(uc.cfg, []model.PointResult{point})
	summary.PointsSampled = 1
	summary.Points = []model.PointResult{point}

	streetLabel := ""
	persisted := false
	submissionID := ""

	if in.Lat != nil && in.Lng != nil {
		label, key := uc.resolveStreet(ctx, *in.Lat, *in.Lng)
		streetLabel = label
		summary.Query = label

		if uc.repo != nil && len(det.BlurredPNG) > 0 {
			blurred := make([]byte, len(det.BlurredPNG))
			copy(blurred, det.BlurredPNG)

			sub := &model.Submission{
				Lat:              *in.Lat,
				Lng:              *in.Lng,
				AccuracyM:        in.Accuracy,
				StreetLabel:      label,
				StreetLabelKey:   key,
				Score:            summary.Score,
				Grade:            summary.Grade,
				PollutionRaw:     summary.PollutionRaw,
				Counts:           summary.Counts,
				Source:           model.SourceCamera,
				ImageBlurred:     blurred,
				ImageContentType: "image/png",
				SubmittedOn:      time.Now().UTC().Truncate(24 * time.Hour),
			}
			if err := uc.repo.Create(ctx, sub); err != nil {
				uc.log.Warn("submission persist failed", "error", err)
			} else {
				persisted = true
				submissionID = sub.ID.String()
			}
			blurred = nil
		} else if uc.repo == nil {
			uc.log.Warn("submission not persisted: database unavailable")
			summary.Limitations = append(summary.Limitations,
				"Veritabanı kullanılamıyor; skor hesaplandı ancak kayıt oluşturulmadı.",
			)
		}
	} else {
		summary.Query = "photo"
		summary.Limitations = append(summary.Limitations,
			"Konum paylaşılmadı; skor hesaplandı ancak haritaya eklenmedi.",
		)
	}

	if len(summary.Limitations) == 0 {
		summary.Limitations = []string{
			"Tek fotoğraf üzerinden hesaplanan skor; belediye konsolu harita görünümü için kamera ile çekim önerilir.",
		}
	}

	det.BlurredPNG = nil

	return &dto.ScorePhotoResponse{
		StreetScore:  summary,
		SubmissionID: submissionID,
		Persisted:    persisted,
		StreetLabel:  streetLabel,
	}, nil
}

func (uc *ScorePhotoUseCase) resolveStreet(ctx context.Context, lat, lng float64) (label, key string) {
	if uc.geocoder != nil {
		l, k, err := uc.geocoder.ReverseGeocode(ctx, lat, lng)
		if err == nil {
			return l, k
		}
		uc.log.Warn("reverse geocode failed", "error", err)
	}
	label = fmt.Sprintf("%.5f, %.5f", lat, lng)
	return label, normalizeStreetKey(label)
}

func normalizeStreetKey(label string) string {
	var b []byte
	lastDash := false
	for i := 0; i < len(label); i++ {
		r := label[i]
		if r >= 'A' && r <= 'Z' {
			r += 'a' - 'A'
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b = append(b, r)
			lastDash = false
			continue
		}
		if !lastDash && len(b) > 0 {
			b = append(b, '-')
			lastDash = true
		}
	}
	for len(b) > 0 && b[len(b)-1] == '-' {
		b = b[:len(b)-1]
	}
	if len(b) == 0 {
		return "unknown"
	}
	return string(b)
}
