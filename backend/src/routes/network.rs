// Backend proxy for the Network Connectivity tool's three external API
// calls. Eliminates browser CORS issues by having the server make these
// requests on the client's behalf. Endpoint shape matches the frontend's
// existing ConnResult type so no rendering code has to change.
//
//   FCC      — geo.fcc.gov   (county FIPS lookup)
//   Census   — api.census.gov (ACS broadband statistics)
//   Overpass — overpass-api.de (cell towers + power infrastructure)

use std::collections::HashMap;

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{error::AppError, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/network-lookup", get(network_lookup))
}

#[derive(Deserialize)]
struct NetworkParams {
    lat: f64,
    lng: f64,
    #[serde(rename = "displayName", default)]
    display_name: String,
}

#[derive(Serialize, Default)]
#[allow(non_snake_case)]
struct NearestSub {
    name: String,
    operator: Option<String>,
    voltage: Option<String>,
    #[serde(rename = "type")]
    sub_type: String,
}

#[derive(Serialize, Default)]
#[allow(non_snake_case)]
struct PowerData {
    substationCount: i64,
    operators: Vec<String>,
    nearestSubDist: Option<f64>,
    nearestSub: Option<NearestSub>,
    voltages: Vec<i64>,
    plantCount: i64,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
struct NetworkResponse {
    lat: f64,
    lon: f64,
    display_name: String,
    countyName: String,
    stateName: String,
    stateCode: String,
    totalHH: i64,
    internetPct: i64,
    broadbandPct: i64,
    satellitePct: i64,
    noInternetPct: i64,
    towerCount: i64,
    towerTypes: HashMap<String, i64>,
    verdict: String,
    power: PowerData,
}

async fn network_lookup(
    State(state): State<AppState>,
    Query(p): Query<NetworkParams>,
) -> Result<Json<NetworkResponse>, AppError> {
    let lat = p.lat;
    let lng = p.lng;

    // ── 1. FCC block lookup → county FIPS + state code ─────────────────────
    let fcc_url = format!(
        "https://geo.fcc.gov/api/census/block/find?latitude={lat}&longitude={lng}&format=json"
    );
    let fcc: Value = state
        .http
        .get(&fcc_url)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("FCC API request failed: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::BadRequest(format!("FCC API returned non-JSON: {e}")))?;

    if fcc.get("status").and_then(|v| v.as_str()) != Some("OK") {
        return Err(AppError::BadRequest("Could not determine FCC coverage area".into()));
    }
    let county_fips = fcc["County"]["FIPS"].as_str().unwrap_or("").to_string();
    let county_name = fcc["County"]["name"].as_str().unwrap_or("").to_string();
    let state_code = fcc["State"]["code"].as_str().unwrap_or("").to_string();
    let state_name = fcc["State"]["name"].as_str().unwrap_or("").to_string();
    let state_fips = fcc["State"]["FIPS"].as_str().unwrap_or("").to_string();
    if county_fips.len() < 2 || state_fips.is_empty() {
        return Err(AppError::BadRequest("FCC response missing FIPS codes".into()));
    }
    let county_code = &county_fips[2..];

    // ── 2. Census ACS broadband data for that county ─────────────────────
    let census_url = format!(
        "https://api.census.gov/data/2022/acs/acs5?get=NAME,B28002_001E,B28002_004E,B28002_007E,B28002_013E&for=county:{county_code}&in=state:{state_fips}"
    );
    let census: Value = state
        .http
        .get(&census_url)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("Census API request failed: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::BadRequest(format!("Census API returned non-JSON: {e}")))?;

    // Response shape is [[headers...], [values...]]. We need to map header
    // names back to their values, then parse the broadband variables.
    let headers = census
        .get(0)
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::BadRequest("Census response empty".into()))?;
    let values = census
        .get(1)
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::BadRequest("Census response missing data row".into()))?;
    let mut census_map: HashMap<String, i64> = HashMap::new();
    for (i, h) in headers.iter().enumerate() {
        if let (Some(name), Some(raw)) = (h.as_str(), values.get(i)) {
            let parsed = raw.as_str().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
            census_map.insert(name.to_string(), parsed);
        }
    }
    let total_hh = census_map.get("B28002_001E").copied().unwrap_or(1).max(1);
    let has_internet = census_map.get("B28002_004E").copied().unwrap_or(0);
    let broadband = census_map.get("B28002_007E").copied().unwrap_or(0);
    let satellite = census_map.get("B28002_013E").copied().unwrap_or(0);
    let internet_pct = (has_internet * 100 / total_hh).max(0);
    let broadband_pct = (broadband * 100 / total_hh).max(0);
    let satellite_pct = (satellite * 100 / total_hh).max(0);
    let no_internet_pct = ((total_hh - has_internet) * 100 / total_hh).max(0);

    // ── 3. Overpass: cell towers (non-fatal — defaults to empty if down) ──
    let tower_query = format!(
        "[out:json][timeout:15];node[\"communication:mobile_phone\"=\"yes\"](around:16000,{lat},{lng});out tags;"
    );
    let (tower_count, tower_types) = match overpass_post(&state, &tower_query).await {
        Ok(json) => {
            let mut types: HashMap<String, i64> = HashMap::new();
            let elements = json.get("elements").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            for el in &elements {
                let t = el
                    .get("tags")
                    .and_then(|v| v.get("tower:construction"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("lattice")
                    .to_string();
                *types.entry(t).or_insert(0) += 1;
            }
            (elements.len() as i64, types)
        }
        Err(_) => (0, HashMap::new()),
    };

    // ── 4. Overpass: power infrastructure (non-fatal) ────────────────────
    let pwr_query = format!(
        "[out:json][timeout:20];(node[\"power\"=\"substation\"](around:40000,{lat},{lng});way[\"power\"=\"substation\"](around:40000,{lat},{lng});way[\"power\"=\"line\"][\"voltage\"](around:20000,{lat},{lng});node[\"power\"=\"plant\"](around:60000,{lat},{lng});way[\"power\"=\"plant\"](around:60000,{lat},{lng}););out tags center;"
    );
    let power = match overpass_post(&state, &pwr_query).await {
        Ok(json) => parse_power(&json, lat, lng),
        Err(_) => PowerData::default(),
    };

    let verdict = if broadband_pct >= 60 { "ready" }
        else if broadband_pct >= 35 { "mixed" }
        else { "starlink" };

    Ok(Json(NetworkResponse {
        lat,
        lon: lng,
        display_name: p.display_name,
        countyName: county_name,
        stateName: state_name,
        stateCode: state_code,
        totalHH: total_hh,
        internetPct: internet_pct,
        broadbandPct: broadband_pct,
        satellitePct: satellite_pct,
        noInternetPct: no_internet_pct,
        towerCount: tower_count,
        towerTypes: tower_types,
        verdict: verdict.to_string(),
        power,
    }))
}

async fn overpass_post(state: &AppState, query: &str) -> Result<Value, reqwest::Error> {
    let body = format!("data={}", urlencoding::encode(query));
    state
        .http
        .post("https://overpass-api.de/api/interpreter")
        .header("content-type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await?
        .json::<Value>()
        .await
}

fn parse_power(json: &Value, lat: f64, lng: f64) -> PowerData {
    let mut data = PowerData::default();
    let mut op_set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    let mut volt_set: std::collections::BTreeSet<i64> = std::collections::BTreeSet::new();
    let mut nearest_dist: Option<f64> = None;
    let mut nearest_sub: Option<NearestSub> = None;

    let elements = json.get("elements").and_then(|v| v.as_array());
    if let Some(elements) = elements {
        for el in elements {
            let tags = el.get("tags").cloned().unwrap_or(Value::Null);
            let power_tag = tags.get("power").and_then(|v| v.as_str()).unwrap_or("");

            if power_tag == "substation" {
                let el_lat = el
                    .get("lat")
                    .and_then(|v| v.as_f64())
                    .or_else(|| el.get("center").and_then(|c| c.get("lat")).and_then(|v| v.as_f64()));
                let el_lon = el
                    .get("lon")
                    .and_then(|v| v.as_f64())
                    .or_else(|| el.get("center").and_then(|c| c.get("lon")).and_then(|v| v.as_f64()));
                if let Some(op) = tags.get("operator").and_then(|v| v.as_str()) {
                    op_set.insert(op.to_string());
                }
                data.substationCount += 1;
                if let (Some(la), Some(lo)) = (el_lat, el_lon) {
                    let d = haversine_km(lat, lng, la, lo);
                    if nearest_dist.map(|nd| d < nd).unwrap_or(true) {
                        nearest_dist = Some(d);
                        nearest_sub = Some(NearestSub {
                            name: tags.get("name").and_then(|v| v.as_str()).unwrap_or("Substation").to_string(),
                            operator: tags.get("operator").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            voltage: tags.get("voltage").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            sub_type: tags.get("substation").and_then(|v| v.as_str()).unwrap_or("distribution").to_string(),
                        });
                    }
                }
            } else if power_tag == "line" {
                if let Some(v) = tags.get("voltage").and_then(|v| v.as_str()).and_then(|s| s.parse::<i64>().ok()) {
                    if v > 0 { volt_set.insert(v); }
                }
                if let Some(op) = tags.get("operator").and_then(|v| v.as_str()) {
                    op_set.insert(op.to_string());
                }
            } else if power_tag == "plant" || power_tag == "generator" {
                data.plantCount += 1;
                if let Some(op) = tags.get("operator").and_then(|v| v.as_str()) {
                    op_set.insert(op.to_string());
                }
                if let Some(name) = tags.get("name").and_then(|v| v.as_str()) {
                    op_set.insert(name.to_string());
                }
            }
        }
    }

    data.operators = op_set.into_iter().take(6).collect();
    let mut volts: Vec<i64> = volt_set.into_iter().collect();
    volts.sort_by(|a, b| b.cmp(a));
    data.voltages = volts.into_iter().take(6).collect();
    data.nearestSubDist = nearest_dist.map(|d| (d * 10.0).round() / 10.0);
    data.nearestSub = nearest_sub;
    data
}

fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6371.0_f64;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    r * 2.0 * a.sqrt().atan2((1.0 - a).sqrt())
}
