// Package model holds the Kaldırım Skoru (sidewalk walkability) domain entities.
//
// This is a pure domain package: it has ZERO external dependencies and never
// imports infrastructure. It defines the vocabulary of the bounded context —
// score requests, anonymized-image detections, per-point results, and the
// aggregated street score — plus the scoring configuration that drives the
// transparent weighted-sum formula (see PLAYBOOK §4).
//
// KVKK note: nothing in this package stores faces, plates, persons, or vehicle
// identifiers. Anonymization face/plate counts are receipts logged at the
// service boundary and are deliberately NOT joined with panorama IDs here.
package model

import "math"

// Grade is the A–F letter grade derived from a 0–100 score.
type Grade string

// Grade buckets (PLAYBOOK §4.2).
const (
	GradeA Grade = "A"
	GradeB Grade = "B"
	GradeC Grade = "C"
	GradeD Grade = "D"
	GradeE Grade = "E"
	GradeF Grade = "F"
)

// Canonical merged class allowlist (PLAYBOOK §7.1 rule 2 / sidecar boundary).
// Any upstream class outside this set is dropped before it reaches scoring.
const (
	ClassPothole         = "pothole"
	ClassGarbage         = "garbage"
	ClassConstructionRd  = "construction_road"
	ClassCultureSidewalk = "culture_sidewalk"
	ClassBrokenSignage   = "broken_signage"
	ClassFadedSignage    = "faded_signage"
	ClassGraffiti        = "graffiti"
	ClassUnkemptFacade   = "unkempt_facade"
)

// AllowedClasses is the immutable set of urban-object classes we score on.
func AllowedClasses() map[string]struct{} {
	return map[string]struct{}{
		ClassPothole:         {},
		ClassGarbage:         {},
		ClassConstructionRd:  {},
		ClassCultureSidewalk: {},
		ClassBrokenSignage:   {},
		ClassFadedSignage:    {},
		ClassGraffiti:        {},
		ClassUnkemptFacade:   {},
	}
}

// GeoPoint is a WGS84 latitude/longitude pair.
type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Detection is a single urban-object detection on an already-anonymized image.
type Detection struct {
	Class      string  `json:"class"`
	Confidence float64 `json:"confidence"`
	// Optional normalized bounding box (0..1 of image dims). Not persisted long-term.
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
	Width  float64 `json:"width,omitempty"`
	Height float64 `json:"height,omitempty"`
}

// PointResult is the detection outcome for one sampled location.
//
// It intentionally does NOT contain face/plate counts; joining panorama IDs
// with anonymization counts is a KVKK red line (PLAYBOOK §8.6).
type PointResult struct {
	Point      GeoPoint    `json:"point"`
	PanoID     string      `json:"pano_id,omitempty"`
	PanoDate   string      `json:"pano_date,omitempty"`
	Headings   []int       `json:"headings,omitempty"`
	Detections []Detection `json:"detections"`
	// Weight is the summed per-class severity at this point, used for the heatmap.
	Weight float64 `json:"weight"`
}

// ClassCount is an aggregated per-class summary across all sampled points.
type ClassCount struct {
	Class         string  `json:"class"`
	Count         int     `json:"count"`
	AvgConfidence float64 `json:"avg_confidence"`
	Weight        float64 `json:"weight"`
	Contribution  float64 `json:"contribution"`
}

// StreetScore is the full aggregated result returned to clients.
type StreetScore struct {
	Query         string       `json:"query"`
	Score         float64      `json:"score"`
	Grade         Grade        `json:"grade"`
	PollutionRaw  float64      `json:"pollution_raw"`
	PointsSampled int          `json:"points_sampled"`
	Counts        []ClassCount `json:"counts"`
	Points        []PointResult `json:"points"`
	PanoramaDates []string     `json:"panorama_dates,omitempty"`
	Limitations   []string     `json:"limitations,omitempty"`
}

// ClassWeight is the weight and saturation cap for one class (PLAYBOOK §4.3).
type ClassWeight struct {
	Weight float64 `json:"weight"`
	Cap    float64 `json:"cap"`
}

// ScoringConfig is the editable, transparent scoring configuration loaded from
// scoring.config.json at startup. Changing weights requires no code changes.
type ScoringConfig struct {
	Classes map[string]ClassWeight `json:"classes"`
	// Grades maps a minimum score to a grade letter; evaluated highest-first.
	Grades []GradeThreshold `json:"grades,omitempty"`
}

// GradeThreshold maps an inclusive minimum score to a grade.
type GradeThreshold struct {
	Min   float64 `json:"min"`
	Grade Grade   `json:"grade"`
}

// DefaultScoringConfig returns the baked-in weights/caps from PLAYBOOK §4.3,
// used as a fallback when scoring.config.json cannot be read.
func DefaultScoringConfig() ScoringConfig {
	return ScoringConfig{
		Classes: map[string]ClassWeight{
			ClassPothole:         {Weight: 8, Cap: 5},
			ClassCultureSidewalk: {Weight: 7, Cap: 8},
			ClassConstructionRd:  {Weight: 7, Cap: 5},
			ClassGarbage:         {Weight: 5, Cap: 10},
			ClassBrokenSignage:   {Weight: 4, Cap: 4},
			ClassGraffiti:        {Weight: 3, Cap: 6},
			ClassFadedSignage:    {Weight: 3, Cap: 4},
			ClassUnkemptFacade:   {Weight: 2, Cap: 4},
		},
		Grades: DefaultGradeThresholds(),
	}
}

// DefaultGradeThresholds returns the A–F cutoffs from PLAYBOOK §4.2.
func DefaultGradeThresholds() []GradeThreshold {
	return []GradeThreshold{
		{Min: 85, Grade: GradeA},
		{Min: 70, Grade: GradeB},
		{Min: 55, Grade: GradeC},
		{Min: 40, Grade: GradeD},
		{Min: 25, Grade: GradeE},
		{Min: 0, Grade: GradeF},
	}
}

// GradeFor returns the grade for a score using the config thresholds (falling
// back to defaults if none are configured).
func (c ScoringConfig) GradeFor(score float64) Grade {
	thresholds := c.Grades
	if len(thresholds) == 0 {
		thresholds = DefaultGradeThresholds()
	}
	best := GradeF
	bestMin := math.Inf(-1)
	for _, t := range thresholds {
		if score >= t.Min && t.Min >= bestMin {
			best = t.Grade
			bestMin = t.Min
		}
	}
	return best
}
