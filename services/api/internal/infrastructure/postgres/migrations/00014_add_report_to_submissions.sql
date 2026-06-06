-- +goose Up
-- +goose StatementBegin
-- The photo scoring path now produces a short Turkish, human-readable
-- visual-pollution assessment (LLM vision scorer) shown on the municipality
-- console. It contains NO identifying content (KVKK Art. 5/6); see
-- KVKK_COMPLIANCE.md §5.4. Default '' keeps pre-existing rows valid.
ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS report TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE submissions
    DROP COLUMN IF EXISTS report;
-- +goose StatementEnd
