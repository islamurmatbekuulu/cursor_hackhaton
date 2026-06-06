// Package dto holds request/response data-transfer objects for the walkability
// application use cases. Validation tags use go-playground/validator (the same
// validator the rest of masterfabric-go uses).
package dto

// ScoreStreetRequest is the JSON body for POST /api/v1/score.
type ScoreStreetRequest struct {
	Street    string `json:"street" validate:"required,min=2,max=200"`
	MaxPoints int    `json:"max_points,omitempty" validate:"omitempty,min=1,max=100"`
}

// ScorePhotoForm describes the multipart upload for POST /api/v1/score/photo.
// (Multipart is parsed in the handler; this type documents the contract.)
type ScorePhotoForm struct {
	// "image" form field — a single street photo (jpeg/png/webp).
}
