CREATE TABLE IF NOT EXISTS equipment (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    subtask_id    BIGINT,
    name          TEXT NOT NULL,
    serial_number TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'ordered',
    operator      TEXT NOT NULL DEFAULT '',
    qty           INTEGER NOT NULL DEFAULT 1,
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_project  ON equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_subtask  ON equipment(subtask_id);
