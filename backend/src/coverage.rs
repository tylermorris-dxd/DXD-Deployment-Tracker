// Multi-dock coverage optimiser.
//
// Answers the question a DFR customer is actually buying an answer to: how many
// docks does it take to reach anywhere in this jurisdiction within N seconds,
// and where do they go?
//
// Shape of the problem: discretise the service area into demand points, propose
// candidate dock sites, work out which demand each candidate reaches inside the
// SLA, then choose the fewest candidates whose union covers everything. That is
// minimum set cover, which is NP-hard, so this uses the greedy approximation —
// repeatedly take the candidate covering the most still-uncovered demand. Greedy
// is within a ln(n) factor of optimal and in practice lands on or very near the
// true minimum for this geometry.
//
// Reach is not a circle centred on the dock. Launch takes time before the
// aircraft moves at all, so the radius is cruise speed times (SLA minus launch
// delay), not times the SLA.
//
// Wind does something subtler than shrinking reach. Solving the wind triangle
// for every course gives, exactly, the still-air circle translated downwind by
// the drift distance — same radius, same area, moved. So wind does not cost
// coverage in aggregate; it moves which ground is covered. That is the failure
// mode worth modelling: a dock that reaches a given address in calm air may not
// reach it in a 20 kt southerly, while picking up ground to the north nobody
// asked about. Aggregate coverage percentage can even improve, which is why it
// is a misleading number to watch on its own.

use serde::{Deserialize, Serialize};

const M_PER_MILE: f64 = 1609.344;

// ── Inputs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatLon {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aircraft {
    /// Seconds between the call and the aircraft actually moving.
    pub launch_delay_sec: f64,
    pub cruise_mph: f64,
}

impl Default for Aircraft {
    fn default() -> Self {
        // DJI Dock 3, matching the fleet map's model table.
        Aircraft { launch_delay_sec: 30.0, cruise_mph: 33.0 }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wind {
    pub speed_ms: f64,
    /// Meteorological: the direction the wind blows FROM.
    pub dir_from_deg: f64,
}

// ── Outputs ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacedDock {
    pub lat: f64,
    pub lon: f64,
    /// Demand points this dock reaches, whether or not another dock also does.
    pub covers: usize,
    /// Demand points this dock was the first to reach — its marginal value.
    pub adds: usize,
    /// Share of all demand covered once this dock is included.
    pub cumulative_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageResult {
    pub docks: Vec<PlacedDock>,
    pub demand_total: usize,
    pub covered_total: usize,
    pub coverage_pct: f64,
    /// Ground the chosen docks cannot reach in time. Capped for transport.
    pub uncovered: Vec<LatLon>,
    pub uncovered_total: usize,
    pub sla_seconds: f64,
    /// Still-air reach at this SLA, for reference against the wind case.
    pub still_air_reach_m: f64,
    pub demand_spacing_m: f64,
    pub candidate_spacing_m: f64,
    /// True when the search stopped on the dock budget rather than on full
    /// coverage — the difference between "this is the answer" and "this is as
    /// far as the budget goes".
    pub hit_dock_limit: bool,
}

// ── Geometry ────────────────────────────────────────────────────────────────

const EARTH_R: f64 = 6_371_000.0;

/// Local tangent plane in metres, east/north from an origin. Accurate to well
/// under a metre across a county, and far cheaper than haversine per pair —
/// which matters when the inner loop runs tens of millions of times.
#[inline]
fn to_local(origin: LatLon, p: LatLon) -> (f64, f64) {
    let lat_rad = origin.lat.to_radians();
    let x = (p.lon - origin.lon).to_radians() * lat_rad.cos() * EARTH_R;
    let y = (p.lat - origin.lat).to_radians() * EARTH_R;
    (x, y)
}

#[inline]
fn from_local(origin: LatLon, x: f64, y: f64) -> LatLon {
    let lat_rad = origin.lat.to_radians();
    LatLon {
        lat: origin.lat + (y / EARTH_R).to_degrees(),
        lon: origin.lon + (x / (EARTH_R * lat_rad.cos())).to_degrees(),
    }
}

/// Ray casting. Points exactly on an edge are not guaranteed either way, which
/// does not matter on a grid sampled at tens of metres.
fn point_in_polygon(poly: &[(f64, f64)], x: f64, y: f64) -> bool {
    let mut inside = false;
    let n = poly.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = poly[i];
        let (xj, yj) = poly[j];
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Ground speed achievable on a course, given airspeed and wind. Standard wind
/// triangle: the cross-wind component has to be crabbed out, and what remains
/// of the airspeed projects onto the course.
#[inline]
fn ground_speed_ms(airspeed_ms: f64, wind: Option<Wind>, course_deg: f64) -> f64 {
    let w = match wind {
        Some(w) if w.speed_ms > 0.0 => w,
        _ => return airspeed_ms,
    };
    let wind_to = (w.dir_from_deg + 180.0) % 360.0;
    let delta = (wind_to - course_deg).to_radians();
    let cross = w.speed_ms * delta.sin();
    if cross.abs() >= airspeed_ms {
        return 0.0; // unflyable course
    }
    w.speed_ms * delta.cos() + (airspeed_ms * airspeed_ms - cross * cross).sqrt()
}

// ── Solver ──────────────────────────────────────────────────────────────────

pub struct CoverageRequest {
    pub area: Vec<LatLon>,
    pub sla_seconds: f64,
    pub aircraft: Aircraft,
    pub wind: Option<Wind>,
    pub max_docks: usize,
    pub target_pct: f64,
    pub demand_spacing_m: f64,
    pub candidate_spacing_m: f64,
}

/// Work is bounded so a large area degrades into a coarser grid rather than a
/// request that never returns.
pub const MAX_DEMAND: usize = 20_000;
pub const MAX_CANDIDATES: usize = 4_000;
const MAX_UNCOVERED_RETURNED: usize = 2_000;

pub fn optimize(req: &CoverageRequest) -> Result<CoverageResult, String> {
    if req.area.len() < 3 {
        return Err("service area needs at least three points".into());
    }
    if req.sla_seconds <= req.aircraft.launch_delay_sec {
        return Err(format!(
            "SLA of {}s is inside the {}s launch delay — the aircraft has not moved yet",
            req.sla_seconds, req.aircraft.launch_delay_sec
        ));
    }

    let origin = centroid(&req.area);
    let poly: Vec<(f64, f64)> = req.area.iter().map(|p| to_local(origin, *p)).collect();

    let (min_x, max_x, min_y, max_y) = bounds(&poly);
    let width = max_x - min_x;
    let height = max_y - min_y;

    // Spacing is widened, never narrowed, if the requested resolution would
    // blow the work budget. Reported back so the caller knows what it got.
    let demand_spacing = fit_spacing(req.demand_spacing_m, width, height, MAX_DEMAND);
    let cand_spacing = fit_spacing(req.candidate_spacing_m, width, height, MAX_CANDIDATES);

    let demand = grid_inside(&poly, min_x, max_x, min_y, max_y, demand_spacing);
    if demand.is_empty() {
        return Err("service area is too small for the chosen demand spacing".into());
    }
    let candidates = grid_inside(&poly, min_x, max_x, min_y, max_y, cand_spacing);
    if candidates.is_empty() {
        return Err("service area is too small to place a dock".into());
    }

    let fly_sec = req.sla_seconds - req.aircraft.launch_delay_sec;
    let airspeed_ms = req.aircraft.cruise_mph * M_PER_MILE / 3600.0;
    let still_air_reach = airspeed_ms * fly_sec;

    // Reachability as a bitset per candidate. The whole solve is set operations
    // after this point, which is what keeps greedy selection cheap.
    let words = (demand.len() + 63) / 64;
    let mut reach: Vec<Vec<u64>> = Vec::with_capacity(candidates.len());
    let mut reach_counts: Vec<usize> = Vec::with_capacity(candidates.len());

    for c in &candidates {
        let mut bits = vec![0u64; words];
        let mut count = 0usize;
        for (i, d) in demand.iter().enumerate() {
            let dx = d.0 - c.0;
            let dy = d.1 - c.1;
            let dist = (dx * dx + dy * dy).sqrt();
            // Cheap rejection before the trigonometry.
            if dist > still_air_reach + wind_margin(req.wind, fly_sec) {
                continue;
            }
            let reach_m = if req.wind.is_some() {
                let course = dx.atan2(dy).to_degrees().rem_euclid(360.0);
                ground_speed_ms(airspeed_ms, req.wind, course) * fly_sec
            } else {
                still_air_reach
            };
            if dist <= reach_m {
                bits[i / 64] |= 1u64 << (i % 64);
                count += 1;
            }
        }
        reach.push(bits);
        reach_counts.push(count);
    }

    // Greedy set cover.
    let mut covered = vec![0u64; words];
    let mut covered_count = 0usize;
    let mut docks: Vec<PlacedDock> = Vec::new();
    let target = ((req.target_pct / 100.0) * demand.len() as f64).ceil() as usize;
    let mut hit_limit = false;

    while covered_count < target.min(demand.len()) {
        if docks.len() >= req.max_docks {
            hit_limit = true;
            break;
        }
        let mut best = None;
        let mut best_gain = 0usize;
        for (idx, bits) in reach.iter().enumerate() {
            let gain: usize = bits
                .iter()
                .zip(covered.iter())
                .map(|(b, c)| (b & !c).count_ones() as usize)
                .sum();
            if gain > best_gain {
                best_gain = gain;
                best = Some(idx);
            }
        }
        // No candidate adds anything: the rest is genuinely out of reach.
        let Some(pick) = best else { break };

        for (c, b) in covered.iter_mut().zip(reach[pick].iter()) {
            *c |= *b;
        }
        covered_count += best_gain;

        let p = from_local(origin, candidates[pick].0, candidates[pick].1);
        docks.push(PlacedDock {
            lat: p.lat,
            lon: p.lon,
            covers: reach_counts[pick],
            adds: best_gain,
            cumulative_pct: 100.0 * covered_count as f64 / demand.len() as f64,
        });
    }

    let mut uncovered = Vec::new();
    for (i, d) in demand.iter().enumerate() {
        if covered[i / 64] & (1u64 << (i % 64)) == 0 {
            uncovered.push(from_local(origin, d.0, d.1));
        }
    }
    let uncovered_total = uncovered.len();
    uncovered.truncate(MAX_UNCOVERED_RETURNED);

    Ok(CoverageResult {
        docks,
        demand_total: demand.len(),
        covered_total: covered_count,
        coverage_pct: 100.0 * covered_count as f64 / demand.len() as f64,
        uncovered,
        uncovered_total,
        sla_seconds: req.sla_seconds,
        still_air_reach_m: still_air_reach,
        demand_spacing_m: demand_spacing,
        candidate_spacing_m: cand_spacing,
        hit_dock_limit: hit_limit,
    })
}

/// Downwind reach can exceed still-air reach, so the cheap pre-filter has to
/// allow for it or it would discard genuinely reachable demand.
#[inline]
fn wind_margin(wind: Option<Wind>, fly_sec: f64) -> f64 {
    wind.map(|w| w.speed_ms * fly_sec).unwrap_or(0.0)
}

fn centroid(area: &[LatLon]) -> LatLon {
    let n = area.len() as f64;
    LatLon {
        lat: area.iter().map(|p| p.lat).sum::<f64>() / n,
        lon: area.iter().map(|p| p.lon).sum::<f64>() / n,
    }
}

fn bounds(poly: &[(f64, f64)]) -> (f64, f64, f64, f64) {
    let mut b = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for (x, y) in poly {
        b.0 = b.0.min(*x);
        b.1 = b.1.max(*x);
        b.2 = b.2.min(*y);
        b.3 = b.3.max(*y);
    }
    b
}

/// Widen spacing until the bounding-box grid fits the budget.
fn fit_spacing(requested: f64, width: f64, height: f64, budget: usize) -> f64 {
    let mut s = requested.max(10.0);
    loop {
        let cells = ((width / s).ceil() + 1.0) * ((height / s).ceil() + 1.0);
        if cells <= budget as f64 || s > 20_000.0 {
            return s;
        }
        s *= 1.25;
    }
}

fn grid_inside(
    poly: &[(f64, f64)],
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    spacing: f64,
) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    let mut y = min_y;
    while y <= max_y {
        let mut x = min_x;
        while x <= max_x {
            if point_in_polygon(poly, x, y) {
                out.push((x, y));
            }
            x += spacing;
        }
        y += spacing;
    }
    out
}
