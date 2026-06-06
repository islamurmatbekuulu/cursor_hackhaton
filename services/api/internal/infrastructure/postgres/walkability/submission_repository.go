package walkability

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// SubmissionRepo implements repository.SubmissionRepository with PostgreSQL.
type SubmissionRepo struct {
	db *pgxpool.Pool
}

// NewSubmissionRepo creates a submission repository.
func NewSubmissionRepo(db *pgxpool.Pool) *SubmissionRepo {
	return &SubmissionRepo{db: db}
}

var _ repository.SubmissionRepository = (*SubmissionRepo)(nil)

func (r *SubmissionRepo) Create(ctx context.Context, s *model.Submission) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	now := time.Now().UTC()
	if s.CreatedAt.IsZero() {
		s.CreatedAt = now
	}
	if s.SubmittedOn.IsZero() {
		s.SubmittedOn = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	}
	if s.Source == "" {
		s.Source = model.SourceCamera
	}
	if s.ImageContentType == "" {
		s.ImageContentType = "image/png"
	}

	countsJSON, err := json.Marshal(s.Counts)
	if err != nil {
		return domainErr.New(domainErr.ErrInternal, "failed to marshal counts", err)
	}

	_, err = r.db.Exec(ctx,
		`INSERT INTO submissions (
			id, submitted_on, lat, lng, accuracy_m, street_label, street_label_key,
			score, grade, pollution_raw, counts, source, image_blurred, image_content_type, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		s.ID, s.SubmittedOn, s.Lat, s.Lng, s.AccuracyM, s.StreetLabel, s.StreetLabelKey,
		s.Score, string(s.Grade), s.PollutionRaw, countsJSON, s.Source, s.ImageBlurred, s.ImageContentType, s.CreatedAt,
	)
	if err != nil {
		return domainErr.New(domainErr.ErrInternal, "failed to create submission", err)
	}
	return nil
}

func (r *SubmissionRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Submission, error) {
	row := r.db.QueryRow(ctx,
		`SELECT id, submitted_on, lat, lng, accuracy_m, street_label, street_label_key,
		        score, grade, pollution_raw, counts, source, image_blurred, image_content_type, created_at
		 FROM submissions WHERE id=$1`, id,
	)
	s, err := scanSubmission(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainErr.New(domainErr.ErrNotFound, "submission not found", nil)
		}
		return nil, domainErr.New(domainErr.ErrInternal, "failed to get submission", err)
	}
	return s, nil
}

func (r *SubmissionRepo) ListByBBox(ctx context.Context, north, south, east, west float64, limit int) ([]*model.Submission, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := r.db.Query(ctx,
		`SELECT id, submitted_on, lat, lng, accuracy_m, street_label, street_label_key,
		        score, grade, pollution_raw, counts, source, image_blurred, image_content_type, created_at
		 FROM submissions
		 WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
		 ORDER BY created_at DESC
		 LIMIT $5`,
		south, north, west, east, limit,
	)
	if err != nil {
		return nil, domainErr.New(domainErr.ErrInternal, "failed to list submissions", err)
	}
	defer rows.Close()

	var out []*model.Submission
	for rows.Next() {
		s, err := scanSubmission(rows)
		if err != nil {
			return nil, domainErr.New(domainErr.ErrInternal, "failed to scan submission", err)
		}
		// List responses must not ship image bytes over JSON; clear before return.
		s.ImageBlurred = nil
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *SubmissionRepo) ListAggregatesByBBox(ctx context.Context, north, south, east, west float64) ([]repository.StreetAggregate, error) {
	rows, err := r.db.Query(ctx,
		`SELECT street_label_key,
		        MIN(street_label) AS street_label,
		        AVG(score)::float8 AS avg_score,
		        COUNT(*)::int AS cnt
		 FROM submissions
		 WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
		 GROUP BY street_label_key
		 ORDER BY avg_score ASC`,
		south, north, west, east,
	)
	if err != nil {
		return nil, domainErr.New(domainErr.ErrInternal, "failed to list street aggregates", err)
	}
	defer rows.Close()

	var out []repository.StreetAggregate
	for rows.Next() {
		var agg repository.StreetAggregate
		if err := rows.Scan(&agg.StreetLabelKey, &agg.StreetLabel, &agg.AvgScore, &agg.Count); err != nil {
			return nil, domainErr.New(domainErr.ErrInternal, "failed to scan aggregate", err)
		}
		out = append(out, agg)
	}
	return out, rows.Err()
}

type scannable interface {
	Scan(dest ...any) error
}

func scanSubmission(row scannable) (*model.Submission, error) {
	var s model.Submission
	var grade string
	var countsJSON []byte
	var submittedOn time.Time
	if err := row.Scan(
		&s.ID, &submittedOn, &s.Lat, &s.Lng, &s.AccuracyM, &s.StreetLabel, &s.StreetLabelKey,
		&s.Score, &grade, &s.PollutionRaw, &countsJSON, &s.Source, &s.ImageBlurred, &s.ImageContentType, &s.CreatedAt,
	); err != nil {
		return nil, err
	}
	s.SubmittedOn = submittedOn
	s.Grade = model.Grade(grade)
	if len(countsJSON) > 0 {
		if err := json.Unmarshal(countsJSON, &s.Counts); err != nil {
			return nil, err
		}
	}
	return &s, nil
}
