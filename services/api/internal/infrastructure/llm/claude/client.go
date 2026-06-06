// Package claude implements the walkability Scorer port against Anthropic's
// Claude vision API (Messages API, https://api.anthropic.com/v1/messages).
//
// It REPLACES the Roboflow object-detection model on the photo scoring path: the
// already-anonymized (face/plate-blurred) PNG is sent to Claude, which returns a
// 0–100 walkability/visual-pollution score, an A–F grade, the observed pollution
// categories, and a short Turkish report.
//
// KVKK (Art. 5/6) hard rules enforced here:
//   - Only the BLURRED PNG is ever sent (callers pass post-/anonymize bytes).
//   - The system prompt instructs the model to assess ONLY sidewalk/visual
//     pollution conditions and to NOT identify people, read/transcribe plates or
//     identifying text, or perform face/plate OCR or person/vehicle tracking.
//   - The client keeps ONLY score/grade/categories/report from the reply; any
//     other (potentially identifying) content the model emits is discarded.
//   - The API key is read from env at startup and is NEVER logged or returned.
//   - Image bytes live in memory only; nothing is written to disk.
package claude

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
)

// anthropicVersion is the required Anthropic API version header value.
const anthropicVersion = "2023-06-01"

// defaultBaseURL is the Anthropic Messages API base.
const defaultBaseURL = "https://api.anthropic.com"

// defaultModel is a current, vision-capable Claude model (verified against the
// account's /v1/models list). Override via CLAUDE_MODEL.
const defaultModel = "claude-sonnet-4-5-20250929"

// maxTokens bounds the (small, JSON-only) completion.
const maxTokens = 700

// systemPrompt is the KVKK-compliant instruction sent on every scoring request.
// It is deliberately explicit about what NOT to do (identify people, read
// plates, OCR, tracking) so the model never returns identifying content.
const systemPrompt = `You are a civic-infrastructure assessor for the city of Istanbul. You evaluate the WALKABILITY and VISUAL-POLLUTION condition of a sidewalk/street from a single street-level photograph for a municipality dashboard.

The image has ALREADY been anonymized: faces and license plates are blurred. Strict privacy rules (KVKK / GDPR) — follow exactly:
- Assess ONLY the physical sidewalk and urban environment condition.
- Do NOT identify, describe, count, or infer anything about people, their appearance, clothing, gender, age, or identity.
- Do NOT read, transcribe, guess, or output any license plate, vehicle identifier, business name, or any text that could identify a person or vehicle.
- Do NOT perform face recognition, license-plate OCR, or person/vehicle tracking of any kind.
- If people or vehicles appear, ignore them entirely except as generic obstacles; never describe who they are.

Assess ONLY these visual-pollution / walkability factors:
- garbage / litter / overflowing bins
- broken, cracked, uneven, or potholed sidewalk pavement
- clutter or objects blocking the pedestrian walkway
- construction debris / rubble obstructing the path
- graffiti / vandalism on walls
- faded, broken, or missing signage
- unkempt / dilapidated building facades

Scoring:
- score: integer 0-100 (100 = pristine and fully walkable, 0 = severely polluted/blocked/unwalkable).
- grade: A (85-100), B (70-84), C (55-69), D (40-54), E (25-39), F (0-24).
- categories: only issues you actually see, each "class" STRICTLY one of: pothole, garbage, construction_road, culture_sidewalk, broken_signage, faded_signage, graffiti, unkempt_facade. (culture_sidewalk = clutter blocking the sidewalk.) Each item: {"class": <key>, "severity": <0.0-1.0>}. Use [] if the sidewalk is clean.
- report_tr: 1-3 sentence assessment in TURKISH of the sidewalk condition and main issues, suitable for a municipality dashboard. Never mention people, vehicles, plates, identity, or that the image was blurred.

Output ONLY one minified JSON object and nothing else (no markdown, no prose):
{"score":<int 0-100>,"grade":"<A-F>","categories":[{"class":"<key>","severity":<0-1>}],"report_tr":"<turkish text>"}`

// userText is the per-request user instruction accompanying the image block.
const userText = "Bu kaldırım/sokak fotoğrafını yukarıdaki kurallara göre değerlendir ve yalnızca istenen JSON nesnesini döndür."

// Config configures the Claude scorer.
type Config struct {
	APIKey  string        // CLAUDE_API_KEY (server-side secret; never logged)
	Model   string        // optional; defaults to defaultModel
	BaseURL string        // optional; defaults to defaultBaseURL
	Timeout time.Duration // optional; defaults to 90s
}

// Client calls the Anthropic Messages API to score anonymized images.
type Client struct {
	cfg   Config
	http  *http.Client
	log   *slog.Logger
	model string
	base  string
}

// New creates a Claude scorer client. The API key must be non-empty (validated
// fail-fast at startup by the caller).
func New(cfg Config, log *slog.Logger) *Client {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 90 * time.Second
	}
	mdl := strings.TrimSpace(cfg.Model)
	if mdl == "" {
		mdl = defaultModel
	}
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if base == "" {
		base = defaultBaseURL
	}
	return &Client{
		cfg:   cfg,
		http:  &http.Client{Timeout: timeout},
		log:   log,
		model: mdl,
		base:  base,
	}
}

var _ repository.Scorer = (*Client)(nil)

// Model returns the configured model id (for startup logging; never the key).
func (c *Client) Model() string { return c.model }

// --- Anthropic Messages API wire types ---

type imageSource struct {
	Type      string `json:"type"`       // "base64"
	MediaType string `json:"media_type"` // "image/png"
	Data      string `json:"data"`       // base64 of blurred PNG
}

type contentBlock struct {
	Type   string       `json:"type"`             // "image" | "text"
	Source *imageSource `json:"source,omitempty"` // for image blocks
	Text   string       `json:"text,omitempty"`   // for text blocks
}

type message struct {
	Role    string         `json:"role"`
	Content []contentBlock `json:"content"`
}

type messagesRequest struct {
	Model     string    `json:"model"`
	MaxTokens int       `json:"max_tokens"`
	System    string    `json:"system"`
	Messages  []message `json:"messages"`
}

type messagesResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Model      string `json:"model"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// scorePayload is the strict JSON contract we ask Claude to emit. Any extra
// fields are ignored; only these are read (KVKK: identifying content discarded).
type scorePayload struct {
	Score      float64 `json:"score"`
	Grade      string  `json:"grade"`
	Categories []struct {
		Class    string  `json:"class"`
		Severity float64 `json:"severity"`
	} `json:"categories"`
	ReportTR string `json:"report_tr"`
}

// ScoreImage sends the blurred PNG to Claude and parses the strict JSON reply.
func (c *Client) ScoreImage(ctx context.Context, blurredPNG []byte) (*repository.ImageScore, error) {
	if c.cfg.APIKey == "" {
		return nil, fmt.Errorf("claude: API key not configured")
	}
	if len(blurredPNG) == 0 {
		return nil, fmt.Errorf("claude: empty image")
	}

	// Audit hash of the (already blurred) bytes we send — never an identity.
	sum := sha256.Sum256(blurredPNG)
	imageSHA := hex.EncodeToString(sum[:])

	reqBody := messagesRequest{
		Model:     c.model,
		MaxTokens: maxTokens,
		System:    systemPrompt,
		Messages: []message{{
			Role: "user",
			Content: []contentBlock{
				{Type: "image", Source: &imageSource{
					Type:      "base64",
					MediaType: "image/png",
					Data:      base64.StdEncoding.EncodeToString(blurredPNG),
				}},
				{Type: "text", Text: userText},
			},
		}},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("claude: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("claude: new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.cfg.APIKey) // secret: header only, never logged
	req.Header.Set("anthropic-version", anthropicVersion)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("claude: request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("claude: read response: %w", err)
	}

	var mr messagesResponse
	if err := json.Unmarshal(raw, &mr); err != nil {
		return nil, fmt.Errorf("claude: decode response (http %d): %w", resp.StatusCode, err)
	}
	if resp.StatusCode != http.StatusOK {
		if mr.Error != nil {
			return nil, fmt.Errorf("claude: api error (http %d): %s: %s", resp.StatusCode, mr.Error.Type, mr.Error.Message)
		}
		return nil, fmt.Errorf("claude: unexpected status %d", resp.StatusCode)
	}

	text := firstText(mr.Content)
	if text == "" {
		return nil, fmt.Errorf("claude: empty model response")
	}

	parsed, err := parseScoreJSON(text)
	if err != nil {
		return nil, fmt.Errorf("claude: parse score json: %w", err)
	}

	out := normalize(parsed)

	// KVKK-safe log: model + audit hash + score/grade + category count ONLY.
	// Never the API key, never the report text, never any identifying content.
	c.log.Info("claude image score",
		"model", mr.Model,
		"image_sha256", imageSHA,
		"score", out.Score,
		"grade", string(out.Grade),
		"categories", len(out.Categories),
		"input_tokens", mr.Usage.InputTokens,
		"output_tokens", mr.Usage.OutputTokens,
	)

	return out, nil
}

// firstText returns the first text content block, if any.
func firstText(blocks []struct {
	Type string `json:"type"`
	Text string `json:"text"`
}) string {
	for _, b := range blocks {
		if b.Type == "text" && strings.TrimSpace(b.Text) != "" {
			return b.Text
		}
	}
	return ""
}

// parseScoreJSON robustly extracts the JSON object from the model text. Claude
// often wraps it in a ```json … ``` fence or adds stray prose; we slice from the
// first '{' to the last '}' and unmarshal that.
func parseScoreJSON(text string) (scorePayload, error) {
	var p scorePayload
	s := strings.TrimSpace(text)

	// Fast path: clean JSON.
	if err := json.Unmarshal([]byte(s), &p); err == nil {
		return p, nil
	}

	// Strip markdown fences if present, then slice to the outermost object.
	s = stripFences(s)
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start < 0 || end < 0 || end <= start {
		return p, fmt.Errorf("no json object found in model output")
	}
	candidate := s[start : end+1]
	if err := json.Unmarshal([]byte(candidate), &p); err != nil {
		return p, fmt.Errorf("invalid json object: %w", err)
	}
	return p, nil
}

// stripFences removes a leading/trailing markdown code fence (``` or ```json).
func stripFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	// Drop the opening fence line (``` or ```json).
	if nl := strings.IndexByte(s, '\n'); nl >= 0 {
		s = s[nl+1:]
	}
	if idx := strings.LastIndex(s, "```"); idx >= 0 {
		s = s[:idx]
	}
	return strings.TrimSpace(s)
}

// normalize clamps the score, validates the grade, and filters categories to the
// canonical allowlist (dropping anything the model invented or any stray field).
func normalize(p scorePayload) *repository.ImageScore {
	score := p.Score
	if math.IsNaN(score) || math.IsInf(score, 0) {
		score = 0
	}
	score = math.Max(0, math.Min(100, score))

	grade := model.Grade(strings.ToUpper(strings.TrimSpace(p.Grade)))
	if !model.ValidGrade(grade) {
		grade = "" // caller derives from score
	}

	allowed := model.AllowedClasses()
	cats := make([]repository.ScoredCategory, 0, len(p.Categories))
	seen := map[string]struct{}{}
	for _, c := range p.Categories {
		key := strings.ToLower(strings.TrimSpace(c.Class))
		if _, ok := allowed[key]; !ok {
			continue // not in allowlist → dropped at the boundary
		}
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		sev := c.Severity
		if math.IsNaN(sev) || math.IsInf(sev, 0) {
			sev = 0
		}
		sev = math.Max(0, math.Min(1, sev))
		cats = append(cats, repository.ScoredCategory{Class: key, Severity: sev})
	}

	return &repository.ImageScore{
		Score:      score,
		Grade:      grade,
		Categories: cats,
		ReportTR:   strings.TrimSpace(p.ReportTR),
	}
}
