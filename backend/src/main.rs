mod db;
mod error;
mod models;
mod routes;
mod template;

use axum::{extract::Extension, http::StatusCode, response::IntoResponse, routing::any, Json, Router};
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "info".to_string()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://./data/tracker.db".to_string());

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| {
        if std::path::Path::new("frontend").exists() {
            "frontend".to_string()
        } else {
            "../frontend/out".to_string()
        }
    });

    // Log startup info (mask password in URL)
    let safe_url = database_url
        .find('@')
        .map(|i| format!("postgres://***@{}", &database_url[i + 1..]))
        .unwrap_or_else(|| "(no @ found in URL)".to_string());
    tracing::info!("DXD Tracker starting on port {}", port);
    tracing::info!("DATABASE_URL: {}", safe_url);
    tracing::info!("STATIC_DIR: {}", static_dir);

    // Try to connect to DB — if it fails, serve a diagnostic page instead of crashing
    let pool = match db::create_pool(&database_url).await {
        Ok(pool) => pool,
        Err(e) => {
            let msg = e.to_string();
            tracing::error!("STARTUP ERROR: {}", msg);
            return run_degraded(&port, msg).await;
        }
    };

    let http = reqwest::Client::new();
    let state = routes::AppState { pool, http };

    let static_path = PathBuf::from(&static_dir);
    let index_path = static_path.join("index.html");

    let serve_dir = ServeDir::new(&static_path)
        .not_found_service(ServeFile::new(&index_path));

    let app = Router::new()
        .nest("/api", routes::api_router(state))
        .fallback_service(serve_dir)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("DXD Tracker listening on http://{}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}

/// Start a minimal HTTP server that returns the startup error on every request.
/// This prevents Azure from showing "Application Error" and lets us diagnose
/// the real issue by hitting /api/health.
async fn run_degraded(port: &str, error: String) -> anyhow::Result<()> {
    let error = Arc::new(error);

    async fn handler(
        Extension(msg): Extension<Arc<String>>,
    ) -> impl IntoResponse {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "status": "startup_failed",
                "error": msg.as_str()
            })),
        )
    }

    let app = Router::new()
        .route("/api/health", any(handler.clone()))
        .fallback(handler)
        .layer(Extension(error));

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Degraded mode — listening on {} — fix startup error above", addr);
    axum::serve(listener, app).await?;
    Ok(())
}
