// Package sidecar implements the Detector port against the Python CV sidecar.
//
// The sidecar enforces "anonymize before detect"; this client honors that
// ordering by calling POST /anonymize first, logging the KVKK receipt
// {face_count, plate_count, image_sha256}, then calling POST /detect with the
// blurred bytes and the receipt hash. Raw image bytes are held in memory only.
package sidecar

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strconv"
	"time"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
)

// Config configures the sidecar client.
type Config struct {
	BaseURL string // e.g. http://localhost:8000
	Token   string // INTERNAL_SIDECAR_TOKEN (Bearer)
}

// Client talks to the FastAPI CV sidecar.
type Client struct {
	cfg  Config
	http *http.Client
	log  *slog.Logger
}

// New creates a sidecar client.
func New(cfg Config, log *slog.Logger) *Client {
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: 60 * time.Second}, // CV cold-start tolerant
		log:  log,
	}
}

var _ repository.Detector = (*Client)(nil)

// AnonymizeAndDetect blurs faces/plates then detects urban objects.
func (c *Client) AnonymizeAndDetect(ctx context.Context, image []byte, mimeType string) (*repository.DetectionResult, error) {
	blurred, receipt, err := c.anonymize(ctx, image, mimeType)
	if err != nil {
		return nil, fmt.Errorf("anonymize: %w", err)
	}

	// KVKK receipt log — emitted BEFORE any detector call, never logs raw bytes.
	c.log.Info("anonymization receipt",
		"face_count", receipt.FaceCount,
		"plate_count", receipt.PlateCount,
		"image_sha256", receipt.ImageSHA256,
	)

	detections, err := c.detect(ctx, blurred, receipt.ImageSHA256)
	if err != nil {
		return nil, fmt.Errorf("detect: %w", err)
	}

	return &repository.DetectionResult{
		Detections:  detections,
		FaceCount:   receipt.FaceCount,
		PlateCount:  receipt.PlateCount,
		ImageSHA256: receipt.ImageSHA256,
	}, nil
}

type receipt struct {
	FaceCount   int
	PlateCount  int
	ImageSHA256 string
}

// anonymize POSTs the raw image and returns blurred PNG bytes + the receipt.
func (c *Client) anonymize(ctx context.Context, image []byte, mimeType string) ([]byte, receipt, error) {
	body, contentType, err := multipartImage("image", filenameFor(mimeType), image)
	if err != nil {
		return nil, receipt{}, err
	}
	req, err := c.newRequest(ctx, http.MethodPost, "/anonymize", body, contentType)
	if err != nil {
		return nil, receipt{}, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, receipt{}, err
	}
	defer func() { _ = resp.Body.Close() }()

	blurred, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, receipt{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, receipt{}, fmt.Errorf("sidecar /anonymize http %d: %s", resp.StatusCode, truncate(blurred))
	}
	rec := receipt{
		FaceCount:   atoiSafe(resp.Header.Get("X-Face-Count")),
		PlateCount:  atoiSafe(resp.Header.Get("X-Plate-Count")),
		ImageSHA256: resp.Header.Get("X-Image-SHA256"),
	}
	return blurred, rec, nil
}

// detect POSTs the blurred image with the anonymization receipt hash.
func (c *Client) detect(ctx context.Context, blurred []byte, sha256 string) ([]model.Detection, error) {
	body, contentType, err := multipartImage("image", "blurred.png", blurred)
	if err != nil {
		return nil, err
	}
	req, err := c.newRequest(ctx, http.MethodPost, "/detect", body, contentType)
	if err != nil {
		return nil, err
	}
	// Receipt hash proves a fresh /anonymize ran first (ordering middleware).
	req.Header.Set("X-Anon-Receipt", sha256)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sidecar /detect http %d: %s", resp.StatusCode, truncate(payload))
	}

	var parsed struct {
		Detections []model.Detection `json:"detections"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return nil, fmt.Errorf("decode detections: %w", err)
	}

	// Defensive allowlist filter (sidecar also enforces this boundary).
	allowed := model.AllowedClasses()
	out := make([]model.Detection, 0, len(parsed.Detections))
	for _, d := range parsed.Detections {
		if _, ok := allowed[d.Class]; ok {
			out = append(out, d)
		}
	}
	return out, nil
}

func (c *Client) newRequest(ctx context.Context, method, path string, body io.Reader, contentType string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.BaseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	if c.cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.Token)
	}
	return req, nil
}

func multipartImage(field, filename string, data []byte) (io.Reader, string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile(field, filename)
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(data); err != nil {
		return nil, "", err
	}
	if err := w.Close(); err != nil {
		return nil, "", err
	}
	return &buf, w.FormDataContentType(), nil
}

func filenameFor(mimeType string) string {
	switch mimeType {
	case "image/png":
		return "upload.png"
	case "image/webp":
		return "upload.webp"
	default:
		return "upload.jpg"
	}
}

func atoiSafe(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

func truncate(b []byte) string {
	const max = 200
	if len(b) > max {
		return string(b[:max])
	}
	return string(b)
}
