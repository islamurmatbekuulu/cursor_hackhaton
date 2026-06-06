// Package streetview implements the StreetViewProvider port against Google Maps
// Platform (Geocoding, Roads snapToRoads, Street View metadata + Static image).
//
// KVKK: raw image bytes are read into memory only (bytes from the HTTP body),
// returned to the caller, and never written to disk. URL signing (HMAC-SHA1) is
// applied only when a signing secret is configured; otherwise calls are unsigned.
package streetview

import (
	"context"
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // required by Google's URL-signing scheme, not used for security
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/model"
	"github.com/masterfabric-go/masterfabric/internal/domain/walkability/repository"
)

const (
	geocodeURL  = "https://maps.googleapis.com/maps/api/geocode/json"
	roadsURL    = "https://roads.googleapis.com/v1/snapToRoads"
	metadataURL = "https://maps.googleapis.com/maps/api/streetview/metadata"
	staticBase  = "https://maps.googleapis.com" // path: /maps/api/streetview
	staticPath  = "/maps/api/streetview"
)

// Config configures the Street View client.
type Config struct {
	APIKey        string
	SigningSecret string // optional; sign only-if-present
	ImageSize     string // e.g. "640x640" (Google max)
	FOV           int
}

// Client is a Google Maps Platform adapter.
type Client struct {
	cfg  Config
	http *http.Client
	log  *slog.Logger
}

// New creates a Street View client. APIKey must be non-empty.
func New(cfg Config, log *slog.Logger) *Client {
	if cfg.ImageSize == "" {
		cfg.ImageSize = "640x640"
	}
	if cfg.FOV == 0 {
		cfg.FOV = 90
	}
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: 15 * time.Second},
		log:  log,
	}
}

var _ repository.StreetViewProvider = (*Client)(nil)

// Geocode resolves a free-text address to a coordinate via the Geocoding API.
func (c *Client) Geocode(ctx context.Context, address string) (model.GeoPoint, error) {
	q := url.Values{}
	q.Set("address", address)
	q.Set("key", c.cfg.APIKey)
	// Bias results toward Istanbul / Türkiye for civic relevance.
	q.Set("region", "tr")
	q.Set("language", "tr")

	var out struct {
		Status  string `json:"status"`
		Results []struct {
			Geometry struct {
				Location struct {
					Lat float64 `json:"lat"`
					Lng float64 `json:"lng"`
				} `json:"location"`
			} `json:"geometry"`
		} `json:"results"`
	}
	if err := c.getJSON(ctx, geocodeURL+"?"+q.Encode(), &out); err != nil {
		return model.GeoPoint{}, err
	}
	if out.Status != "OK" || len(out.Results) == 0 {
		return model.GeoPoint{}, fmt.Errorf("geocode status %q for %q", out.Status, address)
	}
	loc := out.Results[0].Geometry.Location
	return model.GeoPoint{Lat: loc.Lat, Lng: loc.Lng}, nil
}

// ReverseGeocode resolves coordinates to a street label via the Geocoding API.
func (c *Client) ReverseGeocode(ctx context.Context, lat, lng float64) (string, string, error) {
	q := url.Values{}
	q.Set("latlng", fmt.Sprintf("%f,%f", lat, lng))
	q.Set("key", c.cfg.APIKey)
	q.Set("language", "tr")
	q.Set("result_type", "route")

	var out struct {
		Status  string `json:"status"`
		Results []struct {
			FormattedAddress string `json:"formatted_address"`
			Types            []string `json:"types"`
			AddressComponents []struct {
				LongName string   `json:"long_name"`
				Types    []string `json:"types"`
			} `json:"address_components"`
		} `json:"results"`
	}
	if err := c.getJSON(ctx, geocodeURL+"?"+q.Encode(), &out); err != nil {
		return "", "", err
	}
	if out.Status != "OK" || len(out.Results) == 0 {
		label := fmt.Sprintf("%.5f, %.5f", lat, lng)
		return label, normalizeStreetKey(label), nil
	}

	label := ""
	for _, r := range out.Results {
		for _, t := range r.Types {
			if t != "route" {
				continue
			}
			for _, comp := range r.AddressComponents {
				for _, ct := range comp.Types {
					if ct == "route" {
						label = comp.LongName
						break
					}
				}
				if label != "" {
					break
				}
			}
			if label == "" && r.FormattedAddress != "" {
				label = r.FormattedAddress
			}
			break
		}
		if label != "" {
			break
		}
	}
	if label == "" && len(out.Results) > 0 {
		label = out.Results[0].FormattedAddress
	}
	if label == "" {
		label = fmt.Sprintf("%.5f, %.5f", lat, lng)
	}
	return label, normalizeStreetKey(label), nil
}

func normalizeStreetKey(label string) string {
	label = strings.ToLower(strings.TrimSpace(label))
	var b strings.Builder
	lastDash := false
	for _, r := range label {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		return "unknown"
	}
	return s
}

// SnapToRoads aligns a path to road geometry with interpolation.
func (c *Client) SnapToRoads(ctx context.Context, path []model.GeoPoint) ([]model.GeoPoint, error) {
	if len(path) == 0 {
		return nil, fmt.Errorf("empty path")
	}
	parts := make([]string, 0, len(path))
	for _, p := range path {
		parts = append(parts, fmt.Sprintf("%f,%f", p.Lat, p.Lng))
	}
	q := url.Values{}
	q.Set("interpolate", "true")
	q.Set("path", strings.Join(parts, "|"))
	q.Set("key", c.cfg.APIKey)

	var out struct {
		SnappedPoints []struct {
			Location struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
			} `json:"location"`
		} `json:"snappedPoints"`
	}
	if err := c.getJSON(ctx, roadsURL+"?"+q.Encode(), &out); err != nil {
		return nil, err
	}
	points := make([]model.GeoPoint, 0, len(out.SnappedPoints))
	for _, sp := range out.SnappedPoints {
		points = append(points, model.GeoPoint{Lat: sp.Location.Latitude, Lng: sp.Location.Longitude})
	}
	return points, nil
}

// FetchPanorama checks metadata then fetches the Static image for a heading.
// Returns (nil, nil) when there is no Street View coverage (ZERO_RESULTS).
func (c *Client) FetchPanorama(ctx context.Context, p model.GeoPoint, heading int) (*repository.StreetImagery, error) {
	loc := fmt.Sprintf("%f,%f", p.Lat, p.Lng)

	// 1) Metadata (cheap / free) — confirm imagery exists, capture pano date.
	mq := url.Values{}
	mq.Set("location", loc)
	mq.Set("key", c.cfg.APIKey)
	var meta struct {
		Status string `json:"status"`
		Date   string `json:"date"`
		PanoID string `json:"pano_id"`
	}
	if err := c.getJSON(ctx, metadataURL+"?"+mq.Encode(), &meta); err != nil {
		return nil, err
	}
	if meta.Status != "OK" {
		return nil, nil // ZERO_RESULTS / NOT_FOUND → no coverage here
	}

	// 2) Static image.
	iq := url.Values{}
	iq.Set("size", c.cfg.ImageSize)
	iq.Set("location", loc)
	iq.Set("heading", strconv.Itoa(heading))
	iq.Set("pitch", "0")
	iq.Set("fov", strconv.Itoa(c.cfg.FOV))
	iq.Set("key", c.cfg.APIKey)

	rawURL := staticBase + staticPath + "?" + iq.Encode()
	signed, err := c.maybeSign(rawURL)
	if err != nil {
		return nil, err
	}

	img, mime, err := c.getBytes(ctx, signed)
	if err != nil {
		return nil, err
	}
	return &repository.StreetImagery{
		Point:    p,
		Heading:  heading,
		PanoID:   meta.PanoID,
		PanoDate: meta.Date,
		Image:    img,
		MimeType: mime,
	}, nil
}

// maybeSign appends an HMAC-SHA1 signature only if a signing secret is set.
func (c *Client) maybeSign(rawURL string) (string, error) {
	if c.cfg.SigningSecret == "" {
		return rawURL, nil // unsigned (no secret provided) — allowed
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	// Secret is URL-safe base64; decode to raw key bytes.
	key, err := base64.URLEncoding.DecodeString(c.cfg.SigningSecret)
	if err != nil {
		return "", fmt.Errorf("invalid signing secret: %w", err)
	}
	toSign := u.Path + "?" + u.RawQuery
	mac := hmac.New(sha1.New, key)
	mac.Write([]byte(toSign))
	sig := base64.URLEncoding.EncodeToString(mac.Sum(nil))
	return rawURL + "&signature=" + sig, nil
}

func (c *Client) getJSON(ctx context.Context, fullURL string, dst interface{}) error {
	body, _, err := c.getBytes(ctx, fullURL)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, dst)
}

// getBytes performs a GET with small retry/backoff and returns the body bytes.
func (c *Client) getBytes(ctx context.Context, fullURL string) ([]byte, string, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, "", ctx.Err()
			case <-time.After(time.Duration(attempt) * 200 * time.Millisecond):
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests {
			lastErr = fmt.Errorf("street view upstream %d", resp.StatusCode)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			return nil, "", fmt.Errorf("street view http %d", resp.StatusCode)
		}
		return body, resp.Header.Get("Content-Type"), nil
	}
	return nil, "", lastErr
}
