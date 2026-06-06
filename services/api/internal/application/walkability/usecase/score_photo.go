package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"time"

	"github.com/masterfabric-go/masterfabric/internal/application/walkability/dto"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
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
//
// Pipeline (KVKK-ordered): anonymize (face/plate blur) FIRST, then send ONLY the
// blurred PNG to the LLM vision scorer (Claude) for a walkability/visual-pollution
// score, grade, categories, and a Turkish report. The Roboflow object-detector is
// no longer on this path. Raw upload bytes are released immediately after blur.
type ScorePhotoUseCase struct {
	anonymizer repository.Anonymizer
	scorer     repository.Scorer
	geocoder   repository.StreetViewProvider
	repo       repository.SubmissionRepository
	cfg        model.ScoringConfig
	log        *slog.Logger
}

// NewScorePhotoUseCase wires the photo scoring use case.
func NewScorePhotoUseCase(
	anonymizer repository.Anonymizer,
	scorer repository.Scorer,
	geocoder repository.StreetViewProvider,
	repo repository.SubmissionRepository,
	cfg model.ScoringConfig,
	log *slog.Logger,
) *ScorePhotoUseCase {
	return &ScorePhotoUseCase{
		anonymizer: anonymizer,
		scorer:     scorer,
		geocoder:   geocoder,
		repo:       repo,
		cfg:        cfg,
		log:        log,
	}
}

// Execute anonymizes the upload, scores the blurred image with Claude, and
// returns the score payload plus persistence metadata.
func (uc *ScorePhotoUseCase) Execute(ctx context.Context, in ScorePhotoInput) (*dto.ScorePhotoResponse, error) {
	if len(in.Image) == 0 {
		return nil, domainErr.New(domainErr.ErrBadRequest, "empty image upload", nil)
	}

	// KVKK step 1: anonymize FIRST (blur faces + plates). Raw bytes are released
	// immediately; only the blurred PNG may proceed to the scorer.
	anon, err := uc.anonymizer.Anonymize(ctx, in.Image, in.MimeType)
	in.Image = nil
	if err != nil {
		return nil, domainErr.New(domainErr.ErrInternal, "anonymize failed", err)
	}

	// KVKK step 2: score the BLURRED image only (LLM vision; no detector, no
	// person/plate/identity processing — see claude.Client + KVKK_COMPLIANCE §5.4).
	imgScore, err := uc.scorer.ScoreImage(ctx, anon.BlurredPNG)
	if err != nil {
		anon.BlurredPNG = nil
		return nil, domainErr.New(domainErr.ErrInternal, "image scoring failed", err)
	}

	grade := imgScore.Grade
	if !model.ValidGrade(grade) {
		grade = uc.cfg.GradeFor(imgScore.Score)
	}

	point := model.PointResult{Detections: []model.Detection{}}
	if in.Lat != nil && in.Lng != nil {
		point.Point = model.GeoPoint{Lat: *in.Lat, Lng: *in.Lng}
	}

	summary := model.StreetScore{
		Score:         round(imgScore.Score, 2),
		Grade:         grade,
		PollutionRaw:  round(math.Max(0, 100-imgScore.Score), 2),
		PointsSampled: 1,
		Counts:        uc.categoriesToCounts(imgScore.Categories),
		Points:        []model.PointResult{point},
		Report:        imgScore.ReportTR,
	}

	streetLabel := ""
	persisted := false
	submissionID := ""

	if in.Lat != nil && in.Lng != nil {
		label, key := uc.resolveStreet(ctx, *in.Lat, *in.Lng)
		streetLabel = label
		summary.Query = label

		if uc.repo != nil && len(anon.BlurredPNG) > 0 {
			blurred := make([]byte, len(anon.BlurredPNG))
			copy(blurred, anon.BlurredPNG)

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
				Report:           summary.Report,
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
		summary.Query = "Fotoğraf değerlendirmesi"
		summary.Limitations = append(summary.Limitations,
			"Konum paylaşılmadı; skor hesaplandı ancak haritaya eklenmedi.",
		)
	}

	if len(summary.Limitations) == 0 {
		summary.Limitations = []string{
			"Skor, anonimleştirilmiş (yüz/plaka bulanıklaştırılmış) fotoğraf üzerinden Claude görsel değerlendirmesiyle hesaplandı.",
		}
	}

	// Release the blurred bytes held for the response; the persisted copy (if any)
	// already lives in the repository.
	anon.BlurredPNG = nil

	return &dto.ScorePhotoResponse{
		StreetScore:  summary,
		SubmissionID: submissionID,
		Persisted:    persisted,
		StreetLabel:  streetLabel,
	}, nil
}

// categoriesToCounts maps the LLM's observed pollution categories onto the
// existing ClassCount shape so the mobile + web ScoreCard render unchanged. Each
// category counts once; severity is surfaced as the confidence and drives the
// weighted contribution used for jury-friendly ordering.
func (uc *ScorePhotoUseCase) categoriesToCounts(cats []repository.ScoredCategory) []model.ClassCount {
	counts := make([]model.ClassCount, 0, len(cats))
	for _, c := range cats {
		w := uc.cfg.Classes[c.Class].Weight
		counts = append(counts, model.ClassCount{
			Class:         c.Class,
			Count:         1,
			AvgConfidence: round(c.Severity, 4),
			Weight:        w,
			Contribution:  round(w*c.Severity, 4),
		})
	}
	sort.Slice(counts, func(i, j int) bool {
		if counts[i].Contribution != counts[j].Contribution {
			return counts[i].Contribution > counts[j].Contribution
		}
		return counts[i].Class < counts[j].Class
	})
	return counts
}

func round(v float64, places int) float64 {
	pow := math.Pow(10, float64(places))
	return math.Round(v*pow) / pow
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
