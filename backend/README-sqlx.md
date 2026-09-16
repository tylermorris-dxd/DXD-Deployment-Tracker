# Offline query cache (`.sqlx/`)

`sqlx::query!` validates SQL against a live database at **compile** time, but
this project's migrations run at **startup**. That mismatch meant the backend
could only be compiled somewhere that could reach a database — which on a
developer machine means a firewall rule for a residential IP that rotates.

`backend/.sqlx/` is the committed query cache. With it, `cargo check` and
`cargo build` work with no database at all, and CI no longer needs a Postgres
service container or a migrate step.

## When you change a query

Adding or editing a `sqlx::query!` macro invalidates the cache. Regenerate it:

```bash
cd backend
DATABASE_URL=<a database with migrations applied> cargo sqlx prepare
git add .sqlx/
```

Any database with the current schema works — a local Postgres is fine and
preferable to production.

If CI fails with `no cached data for this query`, the cache wasn't regenerated
after a query changed. That failure is deliberate and loud.

## Requirements

`sqlx-cli` must match the `sqlx` version in Cargo.toml and must be built with
TLS, or it cannot reach a TLS-requiring server:

```bash
cargo install sqlx-cli --version 0.7.4 --no-default-features --features postgres,rustls
```

A TLS-less build fails with `TLS upgrade required by connect options but SQLx
was built without TLS support enabled`.
