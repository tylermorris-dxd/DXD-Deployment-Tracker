-- Shared Drone TEVI (Products tool) evaluation state.
-- Single-row table — the whole team works against one shared snapshot
-- of vendor evals, test results, weekly checks, sign-offs, etc.
-- Frontend always reads/writes row id=1.

CREATE TABLE IF NOT EXISTS drone_tevi_state (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    state      TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT ''
);

INSERT INTO drone_tevi_state (id, state, updated_at)
VALUES (1, '{}', '')
ON CONFLICT (id) DO NOTHING;
