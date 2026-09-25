# Working in this repo

Internal deployment tracker for the Deus X Defense ops team and solutions
architects who deploy DJI Dock 3 docks (DroneSense) and DroneTag Scout Remote ID
receivers. Many customers run DFR programmes, where response time is the thing
being bought — so anything touching reach, coverage or RF has real consequences.

Next.js static-export frontend + Rust/Axum backend on Azure Postgres.

## Every commit records which model wrote it

End each commit message with the trailer:

```
Co-Authored-By: <model name> <noreply@anthropic.com>
```

This is not decoration. `CHANGELOG.md` is generated from these trailers, so a
commit without one shows up as *unattributed* and the record of who changed what
gets a hole in it.

After committing, regenerate the changelog:

```bash
node scripts/changelog/build-changelog.mjs
```

It is derived from git — never edit `CHANGELOG.md` by hand. `--check` fails if
it is stale, which is suitable for CI.

Write commit messages that explain *why*, not what. The first paragraph becomes
the changelog entry, so lead with the problem being solved.

## Verifying changes

```bash
# frontend — do both, the build catches lint that tsc misses
cd frontend && npx tsc --noEmit && npm run build

# backend — no database needed, see below
cd backend && SQLX_OFFLINE=true cargo check
```

## Traps that have already cost time here

**`sqlx::query!` is checked against a live database at compile time**, but
migrations run at startup. `backend/.sqlx/` holds the committed offline cache so
builds need no database at all. After adding or changing a `query!` macro,
regenerate it or CI fails with *no cached data for this query*:

```bash
cd backend && DATABASE_URL=<db with migrations> cargo sqlx prepare && git add .sqlx/
```

`sqlx-cli` must match the `sqlx` version in `Cargo.toml` **and** be built with
TLS, or it cannot reach the server:

```bash
cargo install sqlx-cli --version 0.7.4 --no-default-features --features postgres,rustls
```

**When a struct gains a field, grep every construction site before pushing** —
`grep -rn "StructName {" src/`. A hand-written constructor missed this way broke
CI once; the compiler cannot warn you when the DB is unreachable, because the
macro errors abort compilation before type checking runs.

**New columns:** prefer dynamic `sqlx::query()` with `.bind()` over the macro
for anything touching a column added by a migration that may not be applied
where the build runs. Bind `Option<T>` **by value**, not by reference.

**There are two frontends in this repo.** The app is `frontend/`. The top-level
`app/`, `components/`, `lib/`, `db/`, `src/` are an earlier standalone RF-survey
prototype, untracked and superseded by `backend/src/rf.rs`. Do not edit them
expecting the app to change.

## Domain facts worth not getting wrong

- **Dock reach is cruise speed × (SLA − launch delay)**, not × SLA. A Dock 3 at
  a 90 s SLA covers ~885 m, not 1,475 m.
- **Wind translates the reachable envelope downwind** by the drift distance —
  same radius, same area, moved. It does not shrink coverage in aggregate, so
  coverage percentage alone hides the failure mode.
- **ASR structures carry no frequency and are never scored.** They are shown as
  context because cellular is licensed by market, not by point, so the structure
  register is often the only positional record a cell site exists.
- Say **"active deployment"**, never "steady state", in anything user-facing.
