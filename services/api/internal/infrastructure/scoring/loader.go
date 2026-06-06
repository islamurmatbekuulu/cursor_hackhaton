// Package scoring loads the editable scoring configuration (weights + caps)
// from scoring.config.json at startup. Keeping weights in a file means jurors
// can re-tune the formula without a code change (transparency criterion).
package scoring

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
)

// Load reads the scoring config from path. On any failure it logs a warning and
// returns the baked-in defaults (PLAYBOOK §4.3) so the service never fails to
// start over a missing config file.
func Load(path string, log *slog.Logger) model.ScoringConfig {
	if path == "" {
		log.Info("scoring config path empty, using built-in defaults")
		return model.DefaultScoringConfig()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		log.Warn("scoring config not found, using built-in defaults", "path", path, "error", err)
		return model.DefaultScoringConfig()
	}
	cfg, err := parse(data)
	if err != nil {
		log.Warn("scoring config invalid, using built-in defaults", "path", path, "error", err)
		return model.DefaultScoringConfig()
	}
	log.Info("loaded scoring config", "path", path, "classes", len(cfg.Classes))
	return cfg
}

func parse(data []byte) (model.ScoringConfig, error) {
	var cfg model.ScoringConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return model.ScoringConfig{}, fmt.Errorf("parse scoring config: %w", err)
	}
	if len(cfg.Classes) == 0 {
		return model.ScoringConfig{}, fmt.Errorf("scoring config has no classes")
	}
	if len(cfg.Grades) == 0 {
		cfg.Grades = model.DefaultGradeThresholds()
	}
	return cfg, nil
}
