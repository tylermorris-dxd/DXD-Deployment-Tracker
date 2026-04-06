use sqlx::postgres::{PgPool, PgPoolOptions};

pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let safe_url = database_url
        .find('@')
        .map(|i| format!("postgres://***@{}", &database_url[i + 1..]))
        .unwrap_or_else(|| "(invalid url)".to_string());
    tracing::info!("Connecting to database: {}", safe_url);

    let pool = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url),
    )
    .await
    .map_err(|_| anyhow::anyhow!(
        "Database connection timed out after 15s. Check DATABASE_URL app setting and PostgreSQL firewall rules."
    ))?
    .map_err(|e| anyhow::anyhow!("Database connection failed: {}", e))?;

    tracing::info!("Database connected, running migrations...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;

    tracing::info!("Database ready");
    Ok(pool)
}
