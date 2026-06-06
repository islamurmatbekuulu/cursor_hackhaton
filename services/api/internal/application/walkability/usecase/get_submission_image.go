package usecase

import (
	"context"

	"github.com/google/uuid"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
	domainErr "github.com/masterfabric-go/masterfabric/internal/shared/errors"
)

// GetSubmissionImageUseCase serves anonymized blurred PNG bytes for municipality review.
type GetSubmissionImageUseCase struct {
	repo repository.SubmissionRepository
}

// NewGetSubmissionImageUseCase wires the image use case.
func NewGetSubmissionImageUseCase(repo repository.SubmissionRepository) *GetSubmissionImageUseCase {
	return &GetSubmissionImageUseCase{repo: repo}
}

// Execute returns content type and blurred image bytes for a submission.
func (uc *GetSubmissionImageUseCase) Execute(ctx context.Context, id uuid.UUID) (contentType string, body []byte, err error) {
	if uc.repo == nil {
		return "", nil, domainErr.New(domainErr.ErrInternal, "submissions storage unavailable", nil)
	}
	s, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return "", nil, err
	}
	ct := s.ImageContentType
	if ct == "" {
		ct = "image/png"
	}
	return ct, s.ImageBlurred, nil
}
