// TFR (Temporary Flight Restriction) proxy. The FAA's public TFR list is
// served without CORS headers, so the frontend can't fetch it directly.
// This proxy pulls the list server-side, filters to TFRs within a caller-
// supplied radius (in nautical miles), and normalizes the shape enough for
// the operator UI to render a countdown and a click-through.

use axum::{extract::{Query, State}, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{error::AppError, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/tfr", get(list_nearby))
}

#[derive(Deserialize)]
struct NearbyQuery {
    lat: f64,
    lng: f64,
    #[serde(default = "default_radius")]
    radius_nm: f64,
}
fn default_radius() -> f64 { 100.0 }

#[derive(Serialize)]
struct TfrEntry {
    notam_id:        String,
    description:     String,
    effective_start: Option<String>,
    effective_end:   Option<String>,
    lat:             Option<f64>,
    lng:             Option<f64>,
    radius_nm:       Option<f64>,
    distance_nm:     Option<f64>,
    source_url:      Option<String>,
}

// Great-circle distance in nautical miles between two points.
fn haversine_nm(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    let r = 3440.065; // Earth radius in nautical miles
    let dlat = (lat2 - lat1).to_radians();
    let dlng = (lng2 - lng1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlng / 2.0).sin().powi(2);
    2.0 * r * a.sqrt().atan2((1.0 - a).sqrt())
}

async fn list_nearby(
    State(state): State<AppState>,
    Query(q): Query<NearbyQuery>,
) -> Result<Json<Vec<TfrEntry>>, AppError> {
    // FAA's exportTfrList JSON endpoint. It's undocumented public infra but
    // widely used by third-party TFR maps.
    let url = "https://tfr.faa.gov/tfrapi/exportTfrList";
    let resp = state
        .http
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "DXD-Deployment-Tracker/1.0 (ops)")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("FAA TFR fetch failed: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Internal(format!(
            "FAA TFR endpoint returned {}",
            resp.status()
        )));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("FAA TFR parse failed: {e}")))?;

    // The FAA response is a JSON array of objects — field names vary across
    // TFRs so we probe common variants.
    let arr = data.as_array().cloned().unwrap_or_default();
    let mut out: Vec<TfrEntry> = Vec::new();

    for item in arr {
        let get_str = |k: &str| item.get(k).and_then(|v| v.as_str()).map(String::from);
        let get_f64 = |k: &str| item.get(k).and_then(|v| v.as_f64())
            .or_else(|| item.get(k).and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()));

        let lat = get_f64("coreLat").or_else(|| get_f64("lat"));
        let lng = get_f64("coreLon").or_else(|| get_f64("lng")).or_else(|| get_f64("lon"));
        let radius = get_f64("radiusNM").or_else(|| get_f64("radius_nm")).or_else(|| get_f64("coreRadius"));

        // If we can't place the TFR geographically, skip. Better to omit
        // than to hand the operator an ungeo'd blob.
        let (Some(la), Some(ln)) = (lat, lng) else { continue };
        let dist = haversine_nm(q.lat, q.lng, la, ln);
        let effective = radius.unwrap_or(20.0) + q.radius_nm;
        if dist > effective { continue }

        let notam_id = get_str("notam_id").or_else(|| get_str("notamId")).unwrap_or_else(|| "unknown".into());
        let description = get_str("description")
            .or_else(|| get_str("longDescription"))
            .or_else(|| get_str("shortDescription"))
            .unwrap_or_else(|| "(no description)".into());
        let effective_start = get_str("effectiveDate").or_else(|| get_str("effective_start")).or_else(|| get_str("startDate"));
        let effective_end = get_str("expirationDate").or_else(|| get_str("effective_end")).or_else(|| get_str("endDate"));
        let source_url = get_str("detailPageUrl")
            .or_else(|| Some(format!("https://tfr.faa.gov/save_pages/detail_{}.html", notam_id.replace('/', "_"))));

        out.push(TfrEntry {
            notam_id,
            description,
            effective_start,
            effective_end,
            lat, lng,
            radius_nm: radius,
            distance_nm: Some(dist),
            source_url,
        });
    }

    // Nearest first.
    out.sort_by(|a, b| a.distance_nm.partial_cmp(&b.distance_nm).unwrap_or(std::cmp::Ordering::Equal));
    Ok(Json(out))
}
