CREATE TABLE IF NOT EXISTS hubspot_events (
    id                 BIGSERIAL PRIMARY KEY,
    deal_id            TEXT NOT NULL,
    subscription_type  TEXT NOT NULL,
    property_name      TEXT NOT NULL,
    property_value     TEXT NOT NULL,
    occurred_at        BIGINT NOT NULL,
    received_at        TEXT NOT NULL,
    raw                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hubspot_events_deal    ON hubspot_events (deal_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_hubspot_events_received ON hubspot_events (received_at DESC);

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS hs_synced_at TEXT;
