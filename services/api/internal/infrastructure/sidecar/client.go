// Package sidecar implements the Detector port against the Python CV sidecar.
//
// Two flows are supported, matching the imagery source:
//
//   - AnonymizeAndDetect (user photos): POST /anonymize first, log the KVKK
//     receipt {face_count, plate_count, image_sha256}, then POST /detect with
//     the blurred bytes and the receipt hash. The sidecar enforces the receipt
//     gate, guaranteeing "anonymize before detect".
//   - DetectPreBlurred (Google Street View): the imagery is already face/plate
//     blurred at the source, so the local /anonymize step is skipped. The client
//     POSTs /detect with an explicit X-Image-Source assertion; the sidecar
//     bypasses the receipt gate for that narrow, explicit case only. The image
//     SHA-256 is still logged for auditability. See KVKK_COMPLIANCE.md §5.
//
// Raw image bytes are held in memory only; never written to disk.
package sidecar

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
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

// StreetViewSource is the value sent in the X-Image-Source header to assert that
// the posted /detect image is pre-blurred at the source (Google Street View
// blurs faces/plates before publishing). The sidecar bypasses the anonymization
// receipt gate ONLY for requests carrying exactly this assertion.
const StreetViewSource = "google-streetview-preblurred"

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
var _ repository.Anonymizer = (*Client)(nil)

// Anonymize blurs faces/plates on a user-uploaded photo and returns the blurred
// PNG plus the KVKK receipt. It does NOT run any urban-object detector — it is
// the mandatory first step for the LLM (Claude) scoring path, which assesses the
// returned blurred bytes only. The receipt {face_count, plate_count,
// image_sha256} is logged here, before the bytes are handed to any scorer.
func (c *Client) Anonymize(ctx context.Context, image []byte, mimeType string) (*repository.AnonymizeResult, error) {
	blurred, receipt, err := c.anonymize(ctx, image, mimeType)
	if err != nil {
		return nil, fmt.Errorf("anonymize: %w", err)
	}

	// KVKK receipt log — emitted BEFORE the blurred bytes leave for the scorer;
	// never logs raw bytes or any identity.
	c.log.Info("anonymization receipt",
		"face_count", receipt.FaceCount,
		"plate_count", receipt.PlateCount,
		"image_sha256", receipt.ImageSHA256,
	)

	return &repository.AnonymizeResult{
		BlurredPNG:  blurred,
		FaceCount:   receipt.FaceCount,
		PlateCount:  receipt.PlateCount,
		ImageSHA256: receipt.ImageSHA256,
	}, nil
}

// AnonymizeAndDetect blurs faces/plates then detects urban objects. Used for
// user-uploaded photos, which are NOT pre-anonymized: the /anonymize step and
// the sidecar receipt gate are mandatory here.
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

	detections, err := c.detect(ctx, blurred, "blurred.png", detectOpts{receiptSHA: receipt.ImageSHA256})
	if err != nil {
		return nil, fmt.Errorf("detect: %w", err)
	}

	// Copy blurred bytes for optional persistence; detect path consumed a copy.
	blurredCopy := make([]byte, len(blurred))
	copy(blurredCopy, blurred)

	return &repository.DetectionResult{
		Detections:  detections,
		FaceCount:   receipt.FaceCount,
		PlateCount:  receipt.PlateCount,
		ImageSHA256: receipt.ImageSHA256,
		BlurredPNG:  blurredCopy,
	}, nil
}

// DetectPreBlurred detects urban objects on imagery already anonymized at the
// source (Google Street View blurs faces/plates before publishing). It SKIPS
// the local /anonymize step — re-blurring pre-blurred imagery is redundant and
// adds ~60s/scan — and asserts the pre-blurred source via X-Image-Source so the
// sidecar bypasses its receipt gate for this narrow case only.
//
// This change only OMITS a blur step the source already performed; it adds no
// face/plate/person/vehicle processing. The image SHA-256 is still computed and
// logged for auditability. See KVKK_COMPLIANCE.md §5.
func (c *Client) DetectPreBlurred(ctx context.Context, image []byte, mimeType string) (*repository.DetectionResult, error) {
	sum := sha256.Sum256(image)
	imageSHA := hex.EncodeToString(sum[:])

	// KVKK audit log — pre-blurred source asserted; no local blur, no identity data.
	c.log.Info("street view pre-blurred detect",
		"image_source", StreetViewSource,
		"image_sha256", imageSHA,
	)

	detections, err := c.detect(ctx, image, filenameFor(mimeType), detectOpts{source: StreetViewSource})
	if err != nil {
		return nil, fmt.Errorf("detect: %w", err)
	}

	// FaceCount/PlateCount are not applicable (no local anonymize step ran).
	return &repository.DetectionResult{
		Detections:  detections,
		ImageSHA256: imageSHA,
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

// detectOpts selects how the /detect call satisfies the sidecar's gate.
// Exactly one field is set per call:
//   - receiptSHA: proves a fresh /anonymize ran first (user-photo path).
//   - source: asserts the imagery is pre-blurred at the source (Street View),
//     which bypasses the receipt gate for that narrow case only.
type detectOpts struct {
	receiptSHA string
	source     string
}

// detect POSTs the image to the sidecar, attaching either the anonymization
// receipt hash or the pre-blurred source assertion per opts.
func (c *Client) detect(ctx context.Context, img []byte, filename string, opts detectOpts) ([]model.Detection, error) {
	body, contentType, err := multipartImage("image", filename, img)
	if err != nil {
		return nil, err
	}
	req, err := c.newRequest(ctx, http.MethodPost, "/detect", body, contentType)
	if err != nil {
		return nil, err
	}
	if opts.receiptSHA != "" {
		// Receipt hash proves a fresh /anonymize ran first (ordering gate).
		req.Header.Set("X-Anon-Receipt", opts.receiptSHA)
	}
	if opts.source != "" {
		// Source assertion: imagery pre-blurred upstream; bypasses receipt gate.
		req.Header.Set("X-Image-Source", opts.source)
	}

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
