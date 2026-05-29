use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub http: reqwest::Client,
}

pub fn router() -> Router<AppState> {
    // /claude lives in routes::claude (hardened version with model
    // whitelist, max_tokens cap, payload size limits).
    Router::new()
        .route("/health", get(health))
        .route("/me", get(me))
        .route("/geocode", get(geocode))
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "dxd-tracker",
        "version": "2.0"
    }))
}

async fn me(headers: HeaderMap) -> Json<Value> {
    let principal = headers
        .get("x-ms-client-principal-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("local-dev")
        .to_string();
    Json(json!({ "principal": principal }))
}

#[derive(Deserialize)]
struct GeocodeParams {
    address: String,
}

async fn geocode(
    State(state): State<AppState>,
    Query(params): Query<GeocodeParams>,
) -> Result<Json<Value>, AppError> {
    // 1) Try US Census Bureau
    let census_url = format!(
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address={}&benchmark=Public_AR_Current&format=json",
        urlencoding::encode(&params.address)
    );
    if let Ok(resp) = state.http.get(&census_url).send().await {
        if let Ok(data) = resp.json::<Value>().await {
            if let Some(m) = data["result"]["addressMatches"].as_array().and_then(|a| a.first()) {
                let lat = m["coordinates"]["y"].as_f64().unwrap_or(0.0);
                let lng = m["coordinates"]["x"].as_f64().unwrap_or(0.0);
                let display = m["matchedAddress"].as_str().unwrap_or("").to_string();
                return Ok(Json(json!({ "lat": lat, "lng": lng, "display": display, "source": "US Census Bureau" })));
            }
        }
    }

    // 2) Nominatim fallback
    let nom_url = format!(
        "https://nominatim.openstreetmap.org/search?q={}&format=json&limit=1&countrycodes=us",
        urlencoding::encode(&params.address)
    );
    if let Ok(resp) = state
        .http
        .get(&nom_url)
        .header("User-Agent", "DXD-Deployment-Tracker/2.0")
        .send()
        .await
    {
        if let Ok(data) = resp.json::<Value>().await {
            if let Some(first) = data.as_array().and_then(|a| a.first()) {
                let lat = first["lat"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let lng = first["lon"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let display = first["display_name"].as_str().unwrap_or("").to_string();
                return Ok(Json(json!({ "lat": lat, "lng": lng, "display": display, "source": "OpenStreetMap" })));
            }
        }
    }

    Err(AppError::BadRequest("Location not found".into()))
}
