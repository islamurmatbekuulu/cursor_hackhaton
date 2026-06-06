package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
)

// StreetAggregate is an average score grouped by street for map overlays.
type StreetAggregate struct {
	StreetLabelKey string
	StreetLabel    string
	AvgScore       float64
	Grade          model.Grade
	Count          int
}

// SubmissionRepository persists anonymized mobile photo submissions.
type SubmissionRepository interface {
	Create(ctx context.Context, s *model.Submission) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Submission, error)
	ListByBBox(ctx context.Context, north, south, east, west float64, limit int) ([]*model.Submission, error)
	ListAggregatesByBBox(ctx context.Context, north, south, east, west float64) ([]StreetAggregate, error)
}
