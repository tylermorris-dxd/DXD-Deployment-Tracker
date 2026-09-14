-- RF emitters ingested from the FCC (ASR structures, ULS licenses, broadcast)
-- plus anything a tech enters by hand from a site walk.
--
-- Deliberately no PostGIS. A radius search here is a bounding-box prefilter on
-- (lat, lon) followed by an exact haversine in the application, which is fast
-- enough at national emitter counts and avoids depending on an extension being
-- enabled on the managed Postgres instance. If the coverage optimizer later
-- needs real spatial joins, this table can gain a geography column without
-- changing the query path above it.

CREATE TABLE IF NOT EXISTS rf_emitters (
    id           TEXT PRIMARY KEY,
    source       TEXT NOT NULL,              -- asr | uls | broadcast | cell | manual
    name         TEXT NOT NULL,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    freq_mhz     DOUBLE PRECISION,           -- null for bare ASR structures
    erp_dbw      DOUBLE PRECISION,
    height_agl_m DOUBLE PRECISION,
    updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rf_emitters_bbox   ON rf_emitters (lat, lon);
CREATE INDEX IF NOT EXISTS idx_rf_emitters_source ON rf_emitters (source);

-- Survey results persist on the deal like the other per-project tool caches.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rf_cache TEXT;
