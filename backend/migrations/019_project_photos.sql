-- Install photos reuse the existing project_attachments table, tagged with
-- kind = 'photo-<category>' (photo-pre, photo-install, photo-post, photo-issue).
-- A caption is what separates a useful photo record from a pile of JPEGs —
-- "which breaker panel is this" is the question ops actually asks six months
-- later, and the filename never answers it.

ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS caption TEXT;

CREATE INDEX IF NOT EXISTS idx_project_attachments_kind
    ON project_attachments (project_id, kind, added_at DESC);
