// Package walkability provides HTTP handlers for the Kaldırım Skoru endpoints.
// It reuses masterfabric-go's response envelopes, validator, and slog logging.
package walkability

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/masterfabric-go/masterfabric/internal/application/walkability/usecase"
	"github.com/masterfabric-go/masterfabric/internal/shared/response"
)

// maxUploadBytes caps photo uploads (Roboflow ingest limit is 5 MB; we accept a
// little headroom and resize downstream if needed).
const maxUploadBytes = 8 << 20 // 8 MB

// Handler exposes street + photo scoring and submission endpoints.
type Handler struct {
	scoreStreet        *usecase.ScoreStreetUseCase
	scorePhoto         *usecase.ScorePhotoUseCase
	listSubmissions    *usecase.ListSubmissionsUseCase
	getSubmissionImage *usecase.GetSubmissionImageUseCase
}

// NewHandler creates the walkability HTTP handler.
func NewHandler(
	scoreStreet *usecase.ScoreStreetUseCase,
	scorePhoto *usecase.ScorePhotoUseCase,
	listSubmissions *usecase.ListSubmissionsUseCase,
	getSubmissionImage *usecase.GetSubmissionImageUseCase,
) *Handler {
	return &Handler{
		scoreStreet:        scoreStreet,
		scorePhoto:         scorePhoto,
		listSubmissions:    listSubmissions,
		getSubmissionImage: getSubmissionImage,
	}
}

// ScoreStreet handles POST /api/v1/score.
//
// Street View scoring is discontinued (product pivot to mobile submissions).
// The underlying use case remains wired for juror git history but is not executed.
func (h *Handler) ScoreStreet(w http.ResponseWriter, r *http.Request) {
	_ = h.scoreStreet // retained in DI; not invoked
	response.JSON(w, http.StatusGone, map[string]string{
		"error":   "Street View scoring discontinued",
		"message": "Street View scoring discontinued; use mobile photo submissions via POST /api/v1/score/photo",
	})
}

// ScorePhoto handles POST /api/v1/score/photo (multipart upload).
func (h *Handler) ScorePhoto(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		response.JSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart form"})
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		response.JSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'image' file field"})
		return
	}
	defer func() { _ = file.Close() }()

	buf := make([]byte, 0, header.Size)
	tmp := make([]byte, 32<<10)
	for {
		n, readErr := file.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if readErr != nil {
			break
		}
		if len(buf) > maxUploadBytes {
			response.JSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "image too large"})
			return
		}
	}

	mimeType := header.Header.Get("Content-Type")
	input := usecase.ScorePhotoInput{
		Image:    buf,
		MimeType: mimeType,
	}
	buf = nil

	if latStr := r.FormValue("lat"); latStr != "" {
		if lat, err := strconv.ParseFloat(latStr, 64); err == nil {
			input.Lat = &lat
		}
	}
	if lngStr := r.FormValue("lng"); lngStr != "" {
		if lng, err := strconv.ParseFloat(lngStr, 64); err == nil {
			input.Lng = &lng
		}
	}
	if accStr := r.FormValue("accuracy"); accStr != "" {
		if acc, err := strconv.ParseFloat(accStr, 64); err == nil {
			input.Accuracy = &acc
		}
	}

	result, err := h.scorePhoto.Execute(r.Context(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

// ListSubmissions handles GET /api/v1/submissions?north&south&east&west&limit.
func (h *Handler) ListSubmissions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	north, err1 := strconv.ParseFloat(q.Get("north"), 64)
	south, err2 := strconv.ParseFloat(q.Get("south"), 64)
	east, err3 := strconv.ParseFloat(q.Get("east"), 64)
	west, err4 := strconv.ParseFloat(q.Get("west"), 64)
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		response.JSON(w, http.StatusBadRequest, map[string]string{"error": "north, south, east, west query params required"})
		return
	}
	limit := 200
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}

	result, err := h.listSubmissions.Execute(r.Context(), north, south, east, west, limit)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

// GetSubmissionImage handles GET /api/v1/submissions/{id}/image (blurred PNG only).
func (h *Handler) GetSubmissionImage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.JSON(w, http.StatusBadRequest, map[string]string{"error": "invalid submission id"})
		return
	}

	contentType, body, err := h.getSubmissionImage.Execute(r.Context(), id)
	if err != nil {
		response.Error(w, err)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
