// Coverage optimiser endpoint.
//
// POST /api/coverage-optimize
//   Given a service-area polygon and a response-time SLA, returns the fewest
//   dock positions that reach the target share of that area in time, worst-gap
//   first, along with what each one adds.
//
// Pure compute — no database, no external service. Bounded internally so a
// county-sized request coarsens its grid rather than never returning.

use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;

use crate::{
    coverage::{self, Aircraft, CoverageRequest, CoverageResult, LatLon, Wind},
    error::AppError,
    routes::misc::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/coverage-optimize", post(run))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeRequest {
    /// Service area boundary, in order. First and last need not repeat.
    pub area: Vec<LatLon>,
    pub sla_seconds: f64,
    #[serde(default)]
    pub aircraft: Option<Aircraft>,
    #[serde(default)]
    pub wind: Option<Wind>,
    /// Stop after this many docks even if the target is unmet. The response
    /// says whether this is what stopped the search.
    #[serde(default)]
    pub max_docks: Option<usize>,
    /// Share of the area to cover. Below 100 is usually the honest ask — the
    /// last few percent of a jurisdiction is where dock count runs away.
    #[serde(default)]
    pub target_pct: Option<f64>,
    #[serde(default)]
    pub demand_spacing_m: Option<f64>,
    #[serde(default)]
    pub candidate_spacing_m: Option<f64>,
}

async fn run(
    State(_state): State<AppState>,
    Json(body): Json<OptimizeRequest>,
) -> Result<Json<CoverageResult>, AppError> {
    if body.area.len() > 2_000 {
        return Err(AppError::BadRequest("service area has too many vertices".into()));
    }
    for p in &body.area {
        if !p.lat.is_finite() || !p.lon.is_finite()
            || p.lat < -90.0 || p.lat > 90.0 || p.lon < -180.0 || p.lon > 180.0
        {
            return Err(AppError::BadRequest("service area has an invalid coordinate".into()));
        }
    }

    let req = CoverageRequest {
        area: body.area,
        sla_seconds: body.sla_seconds.clamp(1.0, 3_600.0),
        aircraft: body.aircraft.unwrap_or_default(),
        wind: body.wind,
        max_docks: body.max_docks.unwrap_or(200).clamp(1, 500),
        target_pct: body.target_pct.unwrap_or(100.0).clamp(1.0, 100.0),
        demand_spacing_m: body.demand_spacing_m.unwrap_or(200.0).clamp(25.0, 5_000.0),
        candidate_spacing_m: body.candidate_spacing_m.unwrap_or(400.0).clamp(25.0, 10_000.0),
    };

    coverage::optimize(&req).map(Json).map_err(AppError::BadRequest)
}
