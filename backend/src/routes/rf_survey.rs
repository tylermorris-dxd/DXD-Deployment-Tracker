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
use std::collections::HashMap;

use crate::{
    error::AppError,
    rf::{self, Dock, Emitter, SurveyResult, Weights},
    routes::misc::AppState,
};

// A survey pulling more than this many emitters is a sign the radius is wrong;
// the cap keeps one bad request from dragging the whole table into memory.
const MAX_EMITTERS: i64 = 2000;
const LOS_SAMPLES: usize = 48;
/// Registered structures returned alongside the scored emitters. Ordered
/// tall-and-close first, so a cap trims the least interesting.
const MAX_STRUCTURES: i64 = 250;

// USGS 3DEP. Authoritative, no key, and US-only, which matches where docks go.
const ELEVATION_URL: &str =
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples";
// Hard server cap. Sending more does NOT error — it silently returns the first
// 1000 samples, which would hand back line-of-sight answers computed from
// terrain that was never fetched. The response count is checked against the
// request for exactly this reason.
const ELEVATION_BATCH: usize = 1000;
// ~33 m at these latitudes, against 3DEP's 10 m native resolution. Coarse
// enough that near-identical paths to emitters on the same tower collapse onto
// shared cache rows, fine enough to preserve the terrain profile.
const ELEVATION_GRID_DEG: f64 = 0.0003;
// A survey that would need more than this many fresh points is pathological;
// better to fall back to horizon geometry than to hang for minutes.
const MAX_ELEVATION_FETCH: usize = 6000;

fn grid_key(lat: f64, lon: f64) -> (i32, i32) {
    (
        (lat / ELEVATION_GRID_DEG).round() as i32,
        (lon / ELEVATION_GRID_DEG).round() as i32,
    )
}

/// Resolve elevations for every point, reading the cache first and fetching
/// only what is missing. Returns None per point where terrain is unknown.
async fn resolve_elevations(
    state: &AppState,
    points: &[(f64, f64)],
) -> Result<Vec<Option<f64>>, AppError> {
    // Distinct grid cells, in first-seen order.
    let mut order: Vec<(i32, i32)> = Vec::new();
    let mut seen: HashMap<(i32, i32), ()> = HashMap::new();
    let keys: Vec<(i32, i32)> = points
        .iter()
        .map(|(la, lo)| {
            let k = grid_key(*la, *lo);
            if seen.insert(k, ()).is_none() {
                order.push(k);
            }
            k
        })
        .collect();

    let mut known: HashMap<(i32, i32), f64> = HashMap::new();

    let lat_keys: Vec<i32> = order.iter().map(|k| k.0).collect();
    let lon_keys: Vec<i32> = order.iter().map(|k| k.1).collect();
    let cached = sqlx::query(
        "SELECT lat_key, lon_key, elev_m FROM elevation_cache \
         WHERE (lat_key, lon_key) IN (SELECT * FROM UNNEST($1::int[], $2::int[]))",
    )
    .bind(&lat_keys)
    .bind(&lon_keys)
    .fetch_all(&state.pool)
    .await?;
    for r in cached.iter() {
        known.insert((r.get("lat_key"), r.get("lon_key")), r.get("elev_m"));
    }

    let missing: Vec<(i32, i32)> = order.iter().copied().filter(|k| !known.contains_key(k)).collect();

    if !missing.is_empty() && missing.len() <= MAX_ELEVATION_FETCH {
        let fetched = fetch_elevations(&state.http, &missing).await.unwrap_or_default();
        if !fetched.is_empty() {
            let now = chrono::Utc::now().to_rfc3339();
            let (mut la, mut lo, mut ev) = (Vec::new(), Vec::new(), Vec::new());
            for (k, v) in fetched {
                known.insert(k, v);
                la.push(k.0);
                lo.push(k.1);
                ev.push(v);
            }
            // Terrain is immutable, so a conflicting row is already correct.
            let _ = sqlx::query(
                "INSERT INTO elevation_cache (lat_key, lon_key, elev_m, fetched_at) \
                 SELECT * FROM UNNEST($1::int[], $2::int[], $3::float8[]) \
                 CROSS JOIN (SELECT $4::text) AS t \
                 ON CONFLICT (lat_key, lon_key) DO NOTHING",
            )
            .bind(&la)
            .bind(&lo)
            .bind(&ev)
            .bind(&now)
            .execute(&state.pool)
            .await;
        }
    }

    Ok(keys.iter().map(|k| known.get(k).copied()).collect())
}

/// Fetch elevations for grid cells from 3DEP, in batches. A batch that comes
/// back short is discarded rather than mapped positionally — a truncated
/// response would otherwise shift every elevation onto the wrong point.
async fn fetch_elevations(
    http: &reqwest::Client,
    cells: &[(i32, i32)],
) -> anyhow::Result<Vec<((i32, i32), f64)>> {
    let mut out = Vec::new();

    for chunk in cells.chunks(ELEVATION_BATCH) {
        let pts: Vec<[f64; 2]> = chunk
            .iter()
            .map(|(la, lo)| {
                [
                    (*lo as f64) * ELEVATION_GRID_DEG,
                    (*la as f64) * ELEVATION_GRID_DEG,
                ]
            })
            .collect();
        let geometry = serde_json::json!({
            "points": pts,
            "spatialReference": { "wkid": 4326 }
        })
        .to_string();

        let res = http
            .post(ELEVATION_URL)
            .form(&[
                ("geometry", geometry.as_str()),
                ("geometryType", "esriGeometryMultipoint"),
                ("returnFirstValueOnly", "true"),
                ("f", "json"),
            ])
            .send()
            .await?;
        if !res.status().is_success() {
            anyhow::bail!("elevation service {}", res.status());
        }
        let body: serde_json::Value = res.json().await?;
        let samples = match body.get("samples").and_then(|s| s.as_array()) {
            Some(s) => s,
            None => anyhow::bail!("elevation service returned no samples"),
        };
        if samples.len() != chunk.len() {
            anyhow::bail!(
                "elevation service returned {} samples for {} points",
                samples.len(),
                chunk.len()
            );
        }
        for (cell, sample) in chunk.iter().zip(samples) {
            // `value` comes back as a string on this service.
            let v = sample
                .get("value")
                .and_then(|v| v.as_str().and_then(|s| s.parse::<f64>().ok()).or_else(|| v.as_f64()));
            if let Some(v) = v {
                out.push((*cell, v));
            }
        }
    }
    Ok(out)
}

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
    /// True when the emitter query hit its cap, meaning the survey saw only
    /// part of what is in radius. Silently analysing a subset would be worse
    /// than saying so.
    pub emitters_truncated: bool,
    /// True when terrain was requested and the DEM actually answered.
    pub terrain_resolved: bool,
}

async fn run(
    State(state): State<AppState>,
    Json(body): Json<SurveyRequest>,
) -> Result<Json<SurveyResponse>, AppError> {
    survey(&state, &body).await.map(Json)
}

/// The survey itself, callable without going through HTTP. The copilot's
/// rf_survey tool uses this rather than re-implementing the emitter query.
pub async fn survey(state: &AppState, body: &SurveyRequest) -> Result<SurveyResponse, AppError> {
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

    let emitters_truncated = rows.len() as i64 >= MAX_EMITTERS;
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
            erp_dbw: r.try_get::<Option<f64>, _>("erp_dbw").unwrap_or(None),
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
        let erp_dbw = match (m.erp_dbw, m.erp) {
            (Some(v), _) => Some(v),
            (None, Some(w)) => Some(rf::erp_to_dbw(w, m.erp_unit.as_deref().unwrap_or("W"))),
            // Sighted tower with no power estimate — left unknown rather than
            // recorded as zero, which would score it as the weakest thing in view.
            (None, None) => None,
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

    // Registered structures with no frequency. Not scored — see NearbyStructure.
    let struct_rows = sqlx::query(
        "SELECT id, name, lat, lon, height_agl_m          FROM rf_emitters          WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4            AND freq_mhz IS NULL          LIMIT $5",
    )
    .bind(dock.lat - d_lat)
    .bind(dock.lat + d_lat)
    .bind(dock.lon - d_lon)
    .bind(dock.lon + d_lon)
    .bind(MAX_STRUCTURES)
    .fetch_all(&state.pool)
    .await?;

    let in_radius: Vec<(String, String, f64, f64, Option<f64>)> = struct_rows
        .iter()
        .filter_map(|r| {
            let lat: f64 = r.get("lat");
            let lon: f64 = r.get("lon");
            if rf::haversine_m(dock.lat, dock.lon, lat, lon) > radius_m {
                return None;
            }
            Some((
                r.get("id"),
                r.get("name"),
                lat,
                lon,
                r.try_get::<Option<f64>, _>("height_agl_m").unwrap_or(None),
            ))
        })
        .collect();
    let structures = rf::rank_structures(&dock, &in_radius);

    let los_map = if body.use_terrain && !emitters.is_empty() {
        let (points, paths) = rf::los_sample_points(&dock, &emitters, LOS_SAMPLES);
        match resolve_elevations(state, &points).await {
            Ok(elev) => rf::los_from_elevations(&dock, &paths, &elev),
            // Terrain unavailable falls back to horizon geometry rather than
            // failing the survey; the response says which was used.
            Err(_) => Default::default(),
        }
    } else {
        Default::default()
    };
    let terrain_resolved = !los_map.is_empty();

    let result = rf::run_survey(&dock, &emitters, radius_km, weights, &los_map, structures);
    let checklist = rf::build_checklist(&result);

    Ok(SurveyResponse {
        result,
        checklist,
        db_emitter_count,
        manual_emitter_count: manual_count,
        emitters_truncated,
        terrain_resolved,
    })
}
