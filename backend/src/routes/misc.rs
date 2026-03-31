use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
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
    Router::new()
        .route("/health", get(health))
        .route("/me", get(me))
        .route("/claude", post(claude_proxy))
        .route("/geocode", get(geocode))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "dxd-tracker" }))
}

async fn me(headers: HeaderMap) -> Json<Value> {
    let principal = headers
        .get("x-ms-client-principal-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("local-dev")
        .to_string();
    Json(json!({ "principal": principal }))
}

async fn claude_proxy(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        AppError::Internal("ANTHROPIC_API_KEY not configured".into())
    })?;

    let resp = state
        .http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let data: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(data))
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
