-- Project-scoped attachments (parallel to the existing task-scoped
-- attachments table). Used first by the Customer Signoff tool, which
-- generates a PDF at save time and needs to persist it against the
-- deal itself, not against a specific task inside the deal.

CREATE TABLE IF NOT EXISTS project_attachments (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    data       BYTEA NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'other',
    added_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_attachments_project
    ON project_attachments (project_id, added_at DESC);
