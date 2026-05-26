-- Generic key-value state store for global tools that aren't tied to a
-- specific project — Cost Estimator, Security Job Estimator, Event
-- Pricing, etc. Each tool picks a stable tool_key (e.g.
-- 'cost-estimator') and PUTs a JSON snapshot whenever the user saves.

CREATE TABLE IF NOT EXISTS tool_state (
    tool_key   TEXT PRIMARY KEY,
    state      TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT ''
);
