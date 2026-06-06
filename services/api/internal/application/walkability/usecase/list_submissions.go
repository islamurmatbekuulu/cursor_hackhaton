package usecase

import (
	"context"
	"log/slog"
	"time"

	"github.com/masterfabric-go/masterfabric/internal/application/walkability/dto"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// ListSubmissionsUseCase lists submissions in a bounding box for the municipality console.
type ListSubmissionsUseCase struct {
	repo repository.SubmissionRepository
	cfg  model.ScoringConfig
	log  *slog.Logger
}

// NewListSubmissionsUseCase wires the list use case.
func NewListSubmissionsUseCase(repo repository.SubmissionRepository, cfg model.ScoringConfig, log *slog.Logger) *ListSubmissionsUseCase {
	return &ListSubmissionsUseCase{repo: repo, cfg: cfg, log: log}
}

// Execute returns submissions and per-street aggregates inside the bbox.
func (uc *ListSubmissionsUseCase) Execute(ctx context.Context, north, south, east, west float64, limit int) (*dto.SubmissionMapResponse, error) {
	if uc.repo == nil {
		return nil, domainErr.New(domainErr.ErrInternal, "submissions storage unavailable", nil)
	}
	if north <= south || east <= west {
		return nil, domainErr.New(domainErr.ErrBadRequest, "invalid bounding box", nil)
	}

	subs, err := uc.repo.ListByBBox(ctx, north, south, east, west, limit)
	if err != nil {
		return nil, err
	}
	aggs, err := uc.repo.ListAggregatesByBBox(ctx, north, south, east, west)
	if err != nil {
		return nil, err
	}

	out := &dto.SubmissionMapResponse{
		Submissions:      make([]dto.SubmissionDTO, 0, len(subs)),
		StreetAggregates: make([]dto.StreetAggregateDTO, 0, len(aggs)),
	}
	for _, s := range subs {
		out.Submissions = append(out.Submissions, toSubmissionDTO(s))
	}
	for _, a := range aggs {
		out.StreetAggregates = append(out.StreetAggregates, dto.StreetAggregateDTO{
			StreetLabelKey: a.StreetLabelKey,
			StreetLabel:    a.StreetLabel,
			AvgScore:       a.AvgScore,
			Grade:          uc.cfg.GradeFor(a.AvgScore),
			Count:          a.Count,
		})
	}
	return out, nil
}

func toSubmissionDTO(s *model.Submission) dto.SubmissionDTO {
	return dto.SubmissionDTO{
		ID:             s.ID.String(),
		SubmittedOn:    s.SubmittedOn.Format(time.DateOnly),
		Lat:            s.Lat,
		Lng:            s.Lng,
		AccuracyM:      s.AccuracyM,
		StreetLabel:    s.StreetLabel,
		StreetLabelKey: s.StreetLabelKey,
		Score:          s.Score,
		Grade:          s.Grade,
		PollutionRaw:   s.PollutionRaw,
		Counts:         s.Counts,
		Source:         s.Source,
	}
}
