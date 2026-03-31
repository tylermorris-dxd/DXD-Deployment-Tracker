CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    client         TEXT NOT NULL DEFAULT '',
    site           TEXT NOT NULL DEFAULT '',
    description    TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    map_cache      TEXT,
    airspace_cache TEXT,
    network_cache  TEXT,
    weather_cache  TEXT
);

CREATE TABLE IF NOT EXISTS phases (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    title        TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#EF4444',
    description  TEXT NOT NULL DEFAULT '',
    owner        TEXT NOT NULL DEFAULT '',
    unlocked     BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
    id                   TEXT PRIMARY KEY,
    phase_id             TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    completed            BOOLEAN NOT NULL DEFAULT FALSE,
    notes                TEXT NOT NULL DEFAULT '',
    due_date             TEXT NOT NULL DEFAULT '',
    assignee             TEXT NOT NULL DEFAULT '',
    is_gate              BOOLEAN NOT NULL DEFAULT FALSE,
    is_custom            BOOLEAN NOT NULL DEFAULT FALSE,
    track_dates          BOOLEAN NOT NULL DEFAULT FALSE,
    has_stakeholders     BOOLEAN NOT NULL DEFAULT FALSE,
    has_equipment_picker BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subtasks (
    id             BIGSERIAL PRIMARY KEY,
    task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sort_index     INTEGER NOT NULL,
    text           TEXT NOT NULL,
    is_done        BOOLEAN NOT NULL DEFAULT FALSE,
    note           TEXT NOT NULL DEFAULT '',
    ot_ordered     TEXT NOT NULL DEFAULT '',
    ot_shipped     TEXT NOT NULL DEFAULT '',
    ot_eta         TEXT NOT NULL DEFAULT '',
    ot_delivered   TEXT NOT NULL DEFAULT '',
    ot_received_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stakeholder_contacts (
    id         BIGSERIAL PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    phone      TEXT NOT NULL DEFAULT '',
    UNIQUE(task_id, slot_index)
);

CREATE TABLE IF NOT EXISTS attachments (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    mime_type  TEXT NOT NULL DEFAULT '',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    data       BYTEA NOT NULL,
    added_at   TEXT NOT NULL,
    added_by   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS team_members (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    role  TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    assignee    TEXT NOT NULL DEFAULT '',
    due_date    TEXT NOT NULL DEFAULT '',
    priority    TEXT NOT NULL DEFAULT 'medium',
    status      TEXT NOT NULL DEFAULT 'todo',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO app_settings (key, value) VALUES ('quote_seq', '1000') ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_phases_project    ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase       ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task     ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task  ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_task ON stakeholder_contacts(task_id);
