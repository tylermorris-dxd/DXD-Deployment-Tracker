CREATE TABLE IF NOT EXISTS signoff_sessions (
    token          TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_name   TEXT NOT NULL DEFAULT '',
    client_name    TEXT NOT NULL DEFAULT '',
    site           TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    completed_at   TEXT,
    customer_name  TEXT,
    customer_email TEXT,
    strokes        TEXT NOT NULL DEFAULT '[]',
    accepted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_signoff_sessions_project
    ON signoff_sessions (project_id, created_at DESC);
