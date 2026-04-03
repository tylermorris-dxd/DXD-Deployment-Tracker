mod db;
mod error;
mod models;
mod routes;
mod template;

use axum::Router;
use std::path::PathBuf;
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

    // On Azure the binary lands in /home/site/wwwroot/ alongside the frontend/ dir.
    // Locally it runs from backend/ so the frontend is at ../frontend/out.
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| {
        if std::path::Path::new("frontend").exists() {
            "frontend".to_string()
        } else {
            "../frontend/out".to_string()
        }
    });

    tracing::info!("Connecting to database: {}", database_url);
    let pool = db::create_pool(&database_url).await?;

    let http = reqwest::Client::new();
    let state = routes::AppState { pool, http };

    let static_path = PathBuf::from(&static_dir);
    let index_path = static_path.join("index.html");

    // Serve Next.js static export; fall back to index.html for client-side routing
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
