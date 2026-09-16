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

## Scheduling it

The ingest is manual today. Two ways to automate it, and both need one decision
from you first.

It **cannot** run on the app's App Service. That plan is B1 — 1.75 GB of RAM and
one core — and the ULS pass needs an 8 GB heap. It would exhaust the instance
serving the ops team.

### Option A — GitHub Actions (`.github/workflows/fcc-ingest.yml`, already written)

Runners have 16 GB, so the ULS pass fits. OIDC federation to Azure already
exists for the `DXD-Finance` repo, so no long-lived credential is needed.

The catch is the database firewall. A runner is not an Azure service, so the
server's "Allow Azure services" rule does not cover it. The workflow opens a
rule for its own address and deletes it on the way out, including on failure —
but the federated identity currently holds only **Website Contributor on the App
Service**, which cannot touch Postgres firewall rules.

To enable, grant the identity permission on the server and add the secret:

```bash
az role assignment create   --assignee ff7c8350-942d-44a1-99ae-aa44d914756a   --role Contributor   --scope /subscriptions/0c87fd02-06f5-49e3-bf68-5c1c83ea24bc/resourceGroups/rg-deusxdefense-ops-dev/providers/Microsoft.DBforPostgreSQL/flexibleServers/dxd-tracker-pg
```

Then add a `DATABASE_URL` repository secret. A narrower custom role limited to
`Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/*` is worth preferring
over Contributor.

### Option B — Azure Container Apps Job (deployed)

Runs inside Azure, so the server's "Allow Azure services" rule covers it and no
firewall rule is ever opened for it. Memory is sized per job rather than shared
with the web app, which matters because the ULS pass needs several GB and the
app's plan is B1 with 1.75 GB.

Deployed as an ARM template (`infra/fcc-ingest-job.json`) rather than with
`az containerapp`, because that extension cannot install against a 32-bit
Azure CLI Python — its `cryptography` dependency has no 32-bit Windows wheel and
the source build fails. Core `az deployment group create` sidesteps it, and a
template is reproducible in a way shell history is not.

Resources: `dxdtrackeracr` (registry), `dxd-jobs-env` (Container Apps
environment), `dxd-jobs-logs` (Log Analytics), `dxd-fcc-ingest` (the job).

**Rebuild the image after changing the ingest.** No local Docker needed — ACR
builds it server-side:

```bash
az acr build --registry dxdtrackeracr --image dxd-fcc-ingest:latest \
  --file Dockerfile scripts/ingest-fcc
```

The job pulls `:latest` on each run, so a rebuild is all that is required.

**Redeploy the job** (schedule, resources, secrets):

```bash
ACR_USER=$(az acr credential show -n dxdtrackeracr --query username -o tsv)
ACR_PASS=$(az acr credential show -n dxdtrackeracr --query "passwords[0].value" -o tsv)

az deployment group create -g rg-deusxdefense-ops-dev -n fcc-ingest-job \
  --template-file infra/fcc-ingest-job.json \
  --parameters image=dxdtrackeracr.azurecr.io/dxd-fcc-ingest:latest \
    registryServer=dxdtrackeracr.azurecr.io \
    registryUser="$ACR_USER" registryPassword="$ACR_PASS" \
    databaseUrl="<connection string>"
```

**Run it now, off schedule:**

```bash
az rest --method post --url \
  "https://management.azure.com/subscriptions/0c87fd02-06f5-49e3-bf68-5c1c83ea24bc/resourceGroups/rg-deusxdefense-ops-dev/providers/Microsoft.App/jobs/dxd-fcc-ingest/start?api-version=2024-03-01"
```

**Check executions:**

```bash
az rest --method get --url \
  "https://management.azure.com/subscriptions/0c87fd02-06f5-49e3-bf68-5c1c83ea24bc/resourceGroups/rg-deusxdefense-ops-dev/providers/Microsoft.App/jobs/dxd-fcc-ingest/executions?api-version=2024-03-01" \
  --query "value[].{name:name, status:properties.status, start:properties.startTime}" -o table
```

Container logs land in the `dxd-jobs-logs` workspace.

### Cost

The job runs ~30 minutes a week at 4 vCPU / 8 GiB, which is roughly 31,000
vCPU-seconds and 62,000 GiB-seconds a month against Container Apps consumption
free grants of about 180,000 and 360,000. The compute is therefore free, and
the recurring cost is the Basic registry at roughly $5/month plus negligible log
ingestion. Verify against current pricing before relying on those grant figures.

### Which

Option B is deployed and is the one to use. Option A remains in the repository
as a fallback; it is inert because the federated identity lacks the firewall
permission it would need, and it can be deleted once B has run a few cycles
cleanly.

The firewall rule pinned to a personal workstation should now be removed — the
job reaches the database from inside Azure and does not need it.
