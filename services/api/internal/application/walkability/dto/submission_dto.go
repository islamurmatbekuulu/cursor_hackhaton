package dto

import (
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
)

// SubmissionDTO is a persisted mobile submission without image bytes.
type SubmissionDTO struct {
	ID             string        `json:"id"`
	SubmittedOn    string        `json:"submitted_on"`
	Lat            float64       `json:"lat"`
	Lng            float64       `json:"lng"`
	AccuracyM      *float64      `json:"accuracy_m,omitempty"`
	StreetLabel    string        `json:"street_label"`
	StreetLabelKey string        `json:"street_label_key"`
	Score          float64       `json:"score"`
	Grade          model.Grade   `json:"grade"`
	PollutionRaw   float64       `json:"pollution_raw"`
	Counts         []model.ClassCount `json:"counts"`
	Source         string        `json:"source"`
}

// StreetAggregateDTO is an average score per street for map overlays.
type StreetAggregateDTO struct {
	StreetLabelKey string      `json:"street_label_key"`
	StreetLabel    string      `json:"street_label"`
	AvgScore       float64     `json:"avg_score"`
	Grade          model.Grade `json:"grade"`
	Count          int         `json:"count"`
}

// SubmissionMapResponse is returned by GET /api/v1/submissions.
type SubmissionMapResponse struct {
	Submissions      []SubmissionDTO      `json:"submissions"`
	StreetAggregates []StreetAggregateDTO `json:"street_aggregates"`
}

// ScorePhotoResponse extends the scoring payload with persistence metadata.
type ScorePhotoResponse struct {
	model.StreetScore
	SubmissionID string `json:"submission_id,omitempty"`
	Persisted    bool   `json:"persisted"`
	StreetLabel  string `json:"street_label,omitempty"`
}
