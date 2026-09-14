-- Install scheduling — the data behind the master timeline.
--
-- Ops owns this calendar outright. HubSpot's close date is a sales artifact
-- and routinely drifts from the day a crew actually rolls, so these fields are
-- set here and are the source of truth for scheduling.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS install_date     TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS install_end_date TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS install_status   TEXT NOT NULL DEFAULT 'unscheduled';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_tech    TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_notes   TEXT;

-- install_status: unscheduled | scheduled | in_progress | complete | blocked

CREATE INDEX IF NOT EXISTS idx_projects_install_date ON projects (install_date);
