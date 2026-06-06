package usecase

import (
	"context"
	"log/slog"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/service"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// ScorePhotoUseCase scores a single user-captured photo (Expo capture flow).
// It reuses the exact same anonymize→detect→score pipeline as street mode, with
// P = 1 sampled point, so web and mobile render an identical ScoreCard shape.
type ScorePhotoUseCase struct {
	detector repository.Detector
	cfg      model.ScoringConfig
	log      *slog.Logger
}

// NewScorePhotoUseCase wires the photo scoring use case.
func NewScorePhotoUseCase(detector repository.Detector, cfg model.ScoringConfig, log *slog.Logger) *ScorePhotoUseCase {
	return &ScorePhotoUseCase{detector: detector, cfg: cfg, log: log}
}

// Execute anonymizes + detects on the uploaded image and returns a StreetScore.
func (uc *ScorePhotoUseCase) Execute(ctx context.Context, image []byte, mimeType string) (*model.StreetScore, error) {
	if len(image) == 0 {
		return nil, domainErr.New(domainErr.ErrBadRequest, "empty image upload", nil)
	}

	det, err := uc.detector.AnonymizeAndDetect(ctx, image, mimeType)
	// Release raw bytes immediately (KVKK: no raw retention).
	image = nil
	if err != nil {
		return nil, domainErr.New(domainErr.ErrInternal, "anonymize+detect failed", err)
	}

	point := model.PointResult{
		Detections: det.Detections,
		Weight:     service.PointWeight(uc.cfg, det.Detections),
	}
	summary := service.Score(uc.cfg, []model.PointResult{point})
	summary.Query = "photo"
	summary.Points = []model.PointResult{point}
	summary.Limitations = []string{
		"Tek fotoğraf üzerinden hesaplanan skor; sokak geneli için Street View modunu kullanın.",
	}
	return &summary, nil
}
