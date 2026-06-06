// Package walkability provides HTTP handlers for the Kaldırım Skoru endpoints.
// It reuses masterfabric-go's response envelopes, validator, and slog logging.
package walkability

import (
	"net/http"

	"github.com/masterfabric-go/masterfabric/internal/application/walkability/dto"
	"github.com/masterfabric-go/masterfabric/internal/application/walkability/usecase"
	"github.com/masterfabric-go/masterfabric/internal/shared/response"
	"github.com/masterfabric-go/masterfabric/internal/shared/validator"
)

// maxUploadBytes caps photo uploads (Roboflow ingest limit is 5 MB; we accept a
// little headroom and resize downstream if needed).
const maxUploadBytes = 8 << 20 // 8 MB

// Handler exposes street + photo scoring.
type Handler struct {
	scoreStreet *usecase.ScoreStreetUseCase
	scorePhoto  *usecase.ScorePhotoUseCase
}

// NewHandler creates the walkability HTTP handler.
func NewHandler(scoreStreet *usecase.ScoreStreetUseCase, scorePhoto *usecase.ScorePhotoUseCase) *Handler {
	return &Handler{scoreStreet: scoreStreet, scorePhoto: scorePhoto}
}

// ScoreStreet handles POST /api/v1/score.
func (h *Handler) ScoreStreet(w http.ResponseWriter, r *http.Request) {
	var req dto.ScoreStreetRequest
	if err := validator.DecodeAndValidate(r, &req); err != nil {
		response.JSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result, err := h.scoreStreet.Execute(r.Context(), req)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

// ScorePhoto handles POST /api/v1/score/photo (multipart upload, field "image").
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

	// Read into memory only (KVKK: no temp files).
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
	result, err := h.scorePhoto.Execute(r.Context(), buf, mimeType)
	// Release reference promptly.
	buf = nil
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}
