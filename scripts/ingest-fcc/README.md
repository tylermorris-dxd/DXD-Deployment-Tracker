# FCC ingest

Loads FCC bulk data into the `rf_emitters` table so the RF survey works from
emitters the tool found rather than emitters someone typed in.

| Source | What it gives | Scoreable? |
|--------|---------------|------------|
| `uls`  | Licensed transmitters — frequency, ERP, location, antenna height | Yes |
| `asr`  | Registered antenna structures — location, height, owner. No frequency. | No, carried as context |
| `broadcast` | FM **and TV** from the Media Bureau's CDBS — callsign, frequency, ERP, HAAT | Yes |

Broadcast is a separate FCC system (CDBS) from ULS, with its own host, layout
and join key.

TV records still sitting on channels 37-83 are pre-repack leftovers. Those
frequencies belong to cellular and radio astronomy now, so carrying them would
plant TV emitters in the 700/800 MHz bands where they have not transmitted in
years. They are skipped and counted.

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
they are never all held in memory, and a `VACUUM (ANALYZE)` runs after each
source so the dead tuples a reload leaves behind don't slow the next one.

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
| `FCC_CDBS_BASE` | Override the broadcast host. Note the working path has **no** `/ftp` segment — the `/ftp` form 301s to plain http and is then refused. |
| `FCC_USER_AGENT` | Identifies the ingest. Required: `transition.fcc.gov` returns 403 to Node's default agent. |

## Sanity check after any FCC layout change

The FCC re-versions these `.dat` layouts occasionally, and a shifted column
turns coordinates into plausible-looking noise rather than failing loudly. The
dry run prints the numbers that catch it:

```
npx tsx fcc-ingest.ts asr --dry-run
```

A healthy full run loads roughly 197,456 ASR structures, 3.8M ULS emitters and
33,400 broadcast stations (23,240 FM + 10,161 TV). If ULS comes back in the tens of millions, the frequency to
location join has broken and every frequency is being planted at every site on
its licence.

A healthy ASR run:

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

## Broadcast sanity figures

```
rows              33,401        (23,240 FM + 10,161 TV)
inside CONUS      31,880 (95.4%)
with frequency    33,401
FM  freq 87.9-107.9 MHz   median HAAT 148 m
TV  freq 57-605 MHz       median HAAT 244 m
```

FM frequencies must fall entirely within 87.9-107.9 MHz, and TV entirely within
54-88 / 174-216 / 470-608 MHz. Anything outside that
means the channel or frequency column has moved. Height is HAAT — height above
average terrain — which is the right input to the radio-horizon test because it
measures how far the antenna clears its surroundings. RCAMSL would wildly
overstate a mountaintop station.
