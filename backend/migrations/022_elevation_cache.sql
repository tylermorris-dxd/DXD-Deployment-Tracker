-- Terrain elevation cache.
--
-- Line-of-sight sampling is the expensive part of a survey: 700 emitters at 49
-- samples each is ~35,000 points, and the USGS 3DEP service caps a request at
-- 1000 points and takes ~14 seconds regardless of size. Uncached that is eight
-- minutes per survey.
--
-- Two things make it cheap instead. Emitters cluster onto a handful of towers,
-- so their paths from a given dock are nearly identical; and points are keyed
-- to a ~33 m grid, which collapses those near-duplicates onto the same row.
-- Terrain does not change, so a hit is good indefinitely.
--
-- Keys are integers rather than rounded floats so equality is exact.

CREATE TABLE IF NOT EXISTS elevation_cache (
    lat_key    INTEGER NOT NULL,
    lon_key    INTEGER NOT NULL,
    elev_m     DOUBLE PRECISION NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (lat_key, lon_key)
);
