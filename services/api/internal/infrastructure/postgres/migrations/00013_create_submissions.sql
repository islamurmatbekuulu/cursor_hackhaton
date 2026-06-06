-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS submissions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submitted_on        DATE NOT NULL,
    lat                 DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
    lng                 DOUBLE PRECISION NOT NULL CHECK (lng >= -180 AND lng <= 180),
    accuracy_m          REAL,
    street_label        VARCHAR(512) NOT NULL,
    street_label_key    VARCHAR(512) NOT NULL,
    score               NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
    grade               CHAR(1) NOT NULL CHECK (grade IN ('A','B','C','D','E','F')),
    pollution_raw       NUMERIC(10,4) NOT NULL,
    counts              JSONB NOT NULL DEFAULT '[]',
    source              VARCHAR(20) NOT NULL DEFAULT 'camera' CHECK (source = 'camera'),
    image_blurred       BYTEA NOT NULL,
    image_content_type  VARCHAR(64) NOT NULL DEFAULT 'image/png',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_lat_lng ON submissions (lat, lng);
CREATE INDEX idx_submissions_street_label_key ON submissions (street_label_key);
CREATE INDEX idx_submissions_submitted_on ON submissions (submitted_on);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_submissions_submitted_on;
DROP INDEX IF EXISTS idx_submissions_street_label_key;
DROP INDEX IF EXISTS idx_submissions_lat_lng;
DROP TABLE IF EXISTS submissions;
-- +goose StatementEnd
