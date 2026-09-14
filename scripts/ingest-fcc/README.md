# FCC ingest

Loads FCC bulk data into the `rf_emitters` table so the RF survey works from
emitters the tool found rather than emitters someone typed in.

| Source | What it gives | Scoreable? |
|--------|---------------|------------|
| `uls`  | Licensed transmitters — frequency, ERP, location, antenna height | Yes |
| `asr`  | Registered antenna structures — location, height, owner. No frequency. | No, carried as context |
| `broadcast` | FM/TV from the Media Bureau | Not implemented — documented seam |

Survey scoring skips rows with no frequency, so ASR rows never produce a risk
score. They are still worth loading: a 60 m tower 400 m off the dock is
something a tech should walk out and look at even when the registration says
nothing about what transmits from it.

## Setup

```
cd scripts/ingest-fcc
npm install
```

## Running

```
# Verify a parse without touching the database — always do this first
npx tsx fcc-ingest.ts asr --dry-run

# Load for real
DATABASE_URL=postgres://user:pass@host/db npx tsx fcc-ingest.ts          # uls + asr
DATABASE_URL=...                          npx tsx fcc-ingest.ts asr      # one source
```

Each source is a full reload inside a transaction, so a failed run leaves the
previous week's data intact. Rows stream into `COPY` as each archive is parsed;
they are never all held in memory.

Expect roughly 700 MB of downloads and a long runtime for a full ULS pull. ASR
alone is 37 MB and takes about a minute.

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string. Required unless `--dry-run`. |
| `FCC_ULS_BASE` | Override the download host. Default `https://data.fcc.gov/download/pub/uls/complete`. |
| `FCC_ULS_FILES` | Comma-separated subset of ULS archives. Handy for a fast dry run. |
| `FCC_ASR_URL` | Override the ASR archive URL. |
| `FCC_ASR_LOCAL` | Path to an already-downloaded `r_tower.zip`, to skip re-downloading while tuning. |

## Sanity check after any FCC layout change

The FCC re-versions these `.dat` layouts occasionally, and a shifted column
turns coordinates into plausible-looking noise rather than failing loudly. The
dry run prints the numbers that catch it:

```
npx tsx fcc-ingest.ts asr --dry-run
```

A healthy ASR run, verified 2026-09-14:

```
rows              197,456
inside CONUS      193,686 (98.1%)
with height       197,455
height m min/med/max  1.8 / 61.0 / 627.8
```

If CONUS share drops well below ~98%, or the median height stops looking like a
cell tower (~60 m), a column has moved. Field indices are centralised at the top
of `fcc-ingest.ts` so a correction is a one-line edit.

The ULS maps (`HD` / `LO` / `FR`) were verified correct as originally written.
The ASR maps (`CO` / `RA` / `EN`) were **not** and have been corrected — see the
comment block in the script for what was wrong and why.
