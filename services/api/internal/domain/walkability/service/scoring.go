// Package service holds pure domain logic for the walkability score.
//
// The scoring function is deterministic and dependency-free so it can be unit
// tested in isolation and audited by jurors. It implements the transparent
// weighted-sum formula from PLAYBOOK §4.2/§4.3.
package service

import (
	"math"
	"sort"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
)

// Score aggregates per-point detections into a 0–100 street score.
//
// Formula (PLAYBOOK §4.2, matching the worked example in §4.4):
//
//	for each class c:
//	  totalCount_c = Σ detections of c across all P points
//	  avgConf_c    = mean confidence of those detections
//	  contribution = w_c · min(totalCount_c / P, Cap_c) · avgConf_c
//	PollutionRaw = Σ_c contribution
//	Score        = max(0, 100 − PollutionRaw)
//
// Only classes present in the config (the allowlist) contribute; unknown
// classes are ignored. P is the number of sampled points (>=1).
func Score(cfg model.ScoringConfig, points []model.PointResult) model.StreetScore {
	p := len(points)
	if p < 1 {
		p = 1
	}

	type agg struct {
		count   int
		confSum float64
	}
	perClass := make(map[string]*agg)

	for i := range points {
		for _, d := range points[i].Detections {
			if _, ok := cfg.Classes[d.Class]; !ok {
				continue // not in allowlist/config → ignore
			}
			a := perClass[d.Class]
			if a == nil {
				a = &agg{}
				perClass[d.Class] = a
			}
			a.count++
			a.confSum += d.Confidence
		}
	}

	var pollutionRaw float64
	counts := make([]model.ClassCount, 0, len(perClass))
	for class, a := range perClass {
		w := cfg.Classes[class]
		avgConf := 0.0
		if a.count > 0 {
			avgConf = a.confSum / float64(a.count)
		}
		density := float64(a.count) / float64(p)
		if w.Cap > 0 {
			density = math.Min(density, w.Cap)
		}
		contribution := w.Weight * density * avgConf
		pollutionRaw += contribution
		counts = append(counts, model.ClassCount{
			Class:         class,
			Count:         a.count,
			AvgConfidence: round(avgConf, 4),
			Weight:        w.Weight,
			Contribution:  round(contribution, 4),
		})
	}

	// Stable, jury-friendly ordering: highest contribution first.
	sort.Slice(counts, func(i, j int) bool {
		if counts[i].Contribution != counts[j].Contribution {
			return counts[i].Contribution > counts[j].Contribution
		}
		return counts[i].Class < counts[j].Class
	})

	score := math.Max(0, 100-pollutionRaw)
	return model.StreetScore{
		Score:         round(score, 2),
		Grade:         cfg.GradeFor(score),
		PollutionRaw:  round(pollutionRaw, 4),
		PointsSampled: len(points),
		Counts:        counts,
	}
}

// PointWeight returns the summed per-class severity (weight) at a single point,
// used as the heatmap intensity for that coordinate.
func PointWeight(cfg model.ScoringConfig, detections []model.Detection) float64 {
	var sum float64
	for _, d := range detections {
		w, ok := cfg.Classes[d.Class]
		if !ok {
			continue
		}
		sum += w.Weight * d.Confidence
	}
	return round(sum, 4)
}

func round(v float64, places int) float64 {
	pow := math.Pow(10, float64(places))
	return math.Round(v*pow) / pow
}
