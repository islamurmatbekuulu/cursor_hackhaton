package model

import (
	"time"

	"github.com/google/uuid"
)

// SourceCamera marks a mobile camera submission (the only persisted source).
const SourceCamera = "camera"

// Submission is a persisted mobile photo report with anonymized blurred evidence.
//
// KVKK: ImageBlurred holds ONLY the post-/anonymize PNG bytes. Raw uploads are
// never stored. Face/plate counts are not persisted on this entity.
type Submission struct {
	ID               uuid.UUID
	SubmittedOn      time.Time // calendar date (UTC truncated)
	Lat              float64
	Lng              float64
	AccuracyM        *float64
	StreetLabel      string
	StreetLabelKey   string
	Score            float64
	Grade            Grade
	PollutionRaw     float64
	Counts           []ClassCount
	// Report is the LLM vision scorer's short Turkish assessment (no identifying
	// content). Persisted so the municipality console can show what the phone saw.
	Report           string
	Source           string
	ImageBlurred     []byte
	ImageContentType string
	CreatedAt        time.Time
}
