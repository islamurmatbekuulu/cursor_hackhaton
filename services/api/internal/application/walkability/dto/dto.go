// Package dto holds request/response data-transfer objects for the walkability
// application use cases. Validation tags use go-playground/validator (the same
// validator the rest of masterfabric-go uses).
package dto

// ScoreStreetRequest is the JSON body for POST /api/v1/score.
//
// Coordinate path: when the client already has a coordinate (e.g. from Google
// Places Autocomplete) it MAY send Lat+Lng and the backend SKIPS geocoding,
// using (Lat,Lng) directly as the snapToRoads seed. Otherwise Street is
// geocoded as before. Street is therefore required ONLY when Lat/Lng are
// absent — that cross-field rule is enforced in the use case (resolveOrigin),
// which produces clear, layer-appropriate domain errors.
type ScoreStreetRequest struct {
	// Street is the free-text address/street name. Required only when Lat/Lng
	// are absent (validated in the use case).
	Street string `json:"street,omitempty" validate:"omitempty,min=2,max=200"`
	// Lat/Lng are optional client-supplied coordinates. When BOTH are present
	// and in range, geocoding is skipped. Pointers distinguish "absent" from 0.
	Lat *float64 `json:"lat,omitempty" validate:"omitempty,min=-90,max=90"`
	Lng *float64 `json:"lng,omitempty" validate:"omitempty,min=-180,max=180"`
	// PlaceID is the Google Places identifier (logging/diagnostics only — the
	// primary coordinate path is Lat/Lng).
	PlaceID   string `json:"place_id,omitempty" validate:"omitempty,max=256"`
	MaxPoints int    `json:"max_points,omitempty" validate:"omitempty,min=1,max=100"`
}

// HasCoordinates reports whether the request carries a usable (Lat,Lng) pair,
// in which case the use case skips geocoding.
func (r ScoreStreetRequest) HasCoordinates() bool {
	return r.Lat != nil && r.Lng != nil
}

// ScorePhotoForm describes the multipart upload for POST /api/v1/score/photo.
// (Multipart is parsed in the handler; this type documents the contract.)
type ScorePhotoForm struct {
	// "image" form field — a single street photo (jpeg/png/webp).
	// Optional "lat", "lng", "accuracy" text fields for mobile GPS (camera path).
}
