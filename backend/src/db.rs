use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;

pub async fn create_pool(database_url: &str) -> anyhow::Result<SqlitePool> {
    // Ensure parent directory exists for the SQLite file
    let path = database_url
        .strip_prefix("sqlite://")
        .unwrap_or(database_url);
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;

    // Enable WAL mode for better concurrent reads
    sqlx::query("PRAGMA journal_mode=WAL").execute(&pool).await?;
    sqlx::query("PRAGMA foreign_keys=ON").execute(&pool).await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
