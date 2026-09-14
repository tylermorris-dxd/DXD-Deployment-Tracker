// RF site survey endpoint.
//
// POST /api/rf-survey
//   Pulls every ingested emitter within the requested radius, merges in any
//   emitters the tech entered by hand (which may be given as bearing+distance
//   "as sighted" rather than coordinates), optionally resolves terrain
//   line-of-sight against a DEM, scores everything, and returns the result
//   plus a printable field sweep checklist.
//
// Dynamic sqlx throughout: rf_emitters arrives in migration 021 and migrations
// run at startup, not at build time.

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::{
    error::AppError,
    rf::{self, Dock, Emitter, SurveyResult, Weights},
    routes::misc::AppState,
};

// A survey pulling more than this many emitters is a sign the radius is wrong;
// the cap keeps one bad request from dragging the whole table into memory.
const MAX_EMITTERS: i64 = 2000;
const LOS_SAMPLES: usize = 48;

pub fn router() -> Router<AppState> {
    Router::new().route("/rf-survey", post(run))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualEmitter {
    pub name: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    // "As sighted" form — a tech standing at the dock can give a compass
    // bearing and a range estimate far more easily than coordinates.
    pub bearing_deg: Option<f64>,
    pub distance_m: Option<f64>,
    pub freq_mhz: f64,
    pub erp: Option<f64>,
    pub erp_unit: Option<String>,
    pub erp_dbw: Option<f64>,
    pub height_agl_m: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurveyRequest {
    pub dock: Dock,
    pub radius_km: Option<f64>,
    pub weights: Option<Weights>,
    #[serde(default)]
    pub emitters: Vec<ManualEmitter>,
    /// Resolve line-of-sight against terrain. Costs an external elevation
    /// call; falls back to radio-horizon geometry when unavailable.
    #[serde(default)]
    pub use_terrain: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SurveyResponse {
    pub result: SurveyResult,
    pub checklist: String,
    pub db_emitter_count: usize,
    pub manual_emitter_count: usize,
    /// True when terrain was requested and the DEM actually answered.
    pub terrain_resolved: bool,
}

async fn run(
    State(state): State<AppState>,
    Json(body): Json<SurveyRequest>,
) -> Result<Json<SurveyResponse>, AppError> {
    let dock = body.dock;
    if !dock.lat.is_finite() || !dock.lon.is_finite() {
        return Err(AppError::BadRequest("dock lat/lon required".into()));
    }
    if dock.lat < -90.0 || dock.lat > 90.0 || dock.lon < -180.0 || dock.lon > 180.0 {
        return Err(AppError::BadRequest("dock coordinates out of range".into()));
    }

    let radius_km = body.radius_km.unwrap_or(5.0).clamp(0.1, 50.0);
    let weights = body.weights.unwrap_or_default();

    // Bounding box prefilter. Longitude degrees shrink with latitude; the
    // cosine is floored so a high-latitude site can't produce a huge box.
    let d_lat = radius_km / 111.32;
    let d_lon = radius_km / (111.32 * dock.lat.to_radians().cos().abs().max(0.15));

    let rows = sqlx::query(
        "SELECT id, source, name, lat, lon, freq_mhz, erp_dbw, height_agl_m \
         FROM rf_emitters \
         WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4 \
           AND freq_mhz IS NOT NULL \
         LIMIT $5",
    )
    .bind(dock.lat - d_lat)
    .bind(dock.lat + d_lat)
    .bind(dock.lon - d_lon)
    .bind(dock.lon + d_lon)
    .bind(MAX_EMITTERS)
    .fetch_all(&state.pool)
    .await?;

    let radius_m = radius_km * 1000.0;
    let mut emitters: Vec<Emitter> = Vec::new();

    for r in rows.iter() {
        let lat: f64 = r.get("lat");
        let lon: f64 = r.get("lon");
        // Exact distance — the bbox above is a rectangle, this makes it a circle.
        if rf::haversine_m(dock.lat, dock.lon, lat, lon) > radius_m {
            continue;
        }
        emitters.push(Emitter {
            id: r.get("id"),
            source: r.get("source"),
            name: r.get("name"),
            lat,
            lon,
            freq_mhz: r.try_get::<Option<f64>, _>("freq_mhz").unwrap_or(None).unwrap_or(0.0),
            erp_dbw: r.try_get::<Option<f64>, _>("erp_dbw").unwrap_or(None).unwrap_or(0.0),
            height_agl_m: r
                .try_get::<Option<f64>, _>("height_agl_m")
                .unwrap_or(None)
                .unwrap_or(0.0),
        });
    }
    let db_emitter_count = emitters.len();

    // Manual entries. Coordinates win; otherwise project from the sighted
    // bearing and range.
    let mut manual_count = 0usize;
    for (i, m) in body.emitters.iter().enumerate() {
        let (lat, lon) = match (m.lat, m.lon) {
            (Some(la), Some(lo)) => (la, lo),
            _ => match (m.bearing_deg, m.distance_m) {
                (Some(b), Some(d)) => rf::dest_point(dock.lat, dock.lon, b, d),
                _ => {
                    return Err(AppError::BadRequest(
                        "each manual emitter needs either lat/lon or bearingDeg + distanceM".into(),
                    ))
                }
            },
        };
        let erp_dbw = match m.erp_dbw {
            Some(v) => v,
            None => rf::erp_to_dbw(m.erp.unwrap_or(0.0), m.erp_unit.as_deref().unwrap_or("W")),
        };
        emitters.push(Emitter {
            id: format!("manual-{i}"),
            source: "manual".to_string(),
            name: m.name.clone().unwrap_or_else(|| format!("Manual emitter {}", i + 1)),
            lat,
            lon,
            freq_mhz: m.freq_mhz,
            erp_dbw,
            height_agl_m: m.height_agl_m.unwrap_or(0.0),
        });
        manual_count += 1;
    }

    let los_map = if body.use_terrain && !emitters.is_empty() {
        rf::resolve_los_all(&state.http, &dock, &emitters, LOS_SAMPLES).await
    } else {
        Default::default()
    };
    let terrain_resolved = !los_map.is_empty();

    let result = rf::run_survey(&dock, &emitters, radius_km, weights, &los_map);
    let checklist = rf::build_checklist(&result);

    Ok(Json(SurveyResponse {
        result,
        checklist,
        db_emitter_count,
        manual_emitter_count: manual_count,
        terrain_resolved,
    }))
}
