package service

import (
	"math"
	"testing"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
)

func pts(p ...model.PointResult) []model.PointResult { return p }

func point(dets ...model.Detection) model.PointResult {
	return model.PointResult{Detections: dets}
}

func det(class string, conf float64) model.Detection {
	return model.Detection{Class: class, Confidence: conf}
}

func TestScore(t *testing.T) {
	cfg := model.DefaultScoringConfig()

	tests := []struct {
		name      string
		points    []model.PointResult
		wantScore float64
		wantGrade model.Grade
	}{
		{
			name:      "empty street is pristine A",
			points:    pts(point(), point()),
			wantScore: 100,
			wantGrade: model.GradeA,
		},
		{
			name:      "unknown classes are ignored",
			points:    pts(point(det("billboard", 0.9), det("person", 0.9))),
			wantScore: 100,
			wantGrade: model.GradeA,
		},
		{
			// Mirrors PLAYBOOK §4.4 worked example → PollutionRaw ≈ 4.65, Score ≈ 95.35, Grade A.
			name: "playbook worked example",
			points: buildExample(
				exampleClass{model.ClassCultureSidewalk, 12, 0.7},
				exampleClass{model.ClassPothole, 3, 0.65},
				exampleClass{model.ClassGarbage, 5, 0.55},
				exampleClass{model.ClassBrokenSignage, 2, 0.6},
			),
			wantScore: 95.35,
			wantGrade: model.GradeA,
		},
		{
			// A heavily polluted single photo: caps bind, score should drop low.
			name: "single bad photo drops grade",
			points: pts(point(
				det(model.ClassPothole, 0.9), det(model.ClassPothole, 0.9),
				det(model.ClassPothole, 0.9), det(model.ClassPothole, 0.9),
				det(model.ClassPothole, 0.9), det(model.ClassPothole, 0.9),
				det(model.ClassCultureSidewalk, 0.9), det(model.ClassCultureSidewalk, 0.9),
				det(model.ClassCultureSidewalk, 0.9), det(model.ClassCultureSidewalk, 0.9),
			)),
			// pothole: 8*min(6,5)*0.9 = 36 ; clutter: 7*min(4,8)*0.9 = 25.2 → raw 61.2 → score 38.8
			wantScore: 38.8,
			wantGrade: model.GradeE,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Score(cfg, tt.points)
			if math.Abs(got.Score-tt.wantScore) > 0.05 {
				t.Errorf("score = %v, want %v", got.Score, tt.wantScore)
			}
			if got.Grade != tt.wantGrade {
				t.Errorf("grade = %v, want %v", got.Grade, tt.wantGrade)
			}
		})
	}
}

func TestGradeFor(t *testing.T) {
	cfg := model.DefaultScoringConfig()
	cases := map[float64]model.Grade{
		100: model.GradeA, 85: model.GradeA,
		84: model.GradeB, 70: model.GradeB,
		60: model.GradeC, 55: model.GradeC,
		50: model.GradeD, 40: model.GradeD,
		30: model.GradeE, 25: model.GradeE,
		10: model.GradeF, 0: model.GradeF,
	}
	for score, want := range cases {
		if got := cfg.GradeFor(score); got != want {
			t.Errorf("GradeFor(%v) = %v, want %v", score, got, want)
		}
	}
}

type exampleClass struct {
	class string
	count int
	conf  float64
}

// buildExample spreads `count` detections of each class across 20 points so the
// aggregate density (count/20) matches the PLAYBOOK §4.4 example.
func buildExample(classes ...exampleClass) []model.PointResult {
	const p = 20
	points := make([]model.PointResult, p)
	for _, c := range classes {
		for i := 0; i < c.count; i++ {
			idx := i % p
			points[idx].Detections = append(points[idx].Detections, det(c.class, c.conf))
		}
	}
	return points
}
