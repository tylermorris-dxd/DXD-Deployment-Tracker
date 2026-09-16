// RF site-survey triage engine.
//
// Ported from the TypeScript proof of concept in lib/rf-survey/. The scoring
// rubric, band plan and factor curves are carried over verbatim — including
// the DES weight raised to 0.70 against RCSO ground truth — so results stay
// comparable to anything already validated in the field.
//
// What this answers: which nearby transmitters are likely to desense the
// dock's control link, and on what bearing should a tech point a spectrum
// analyzer. It is desktop triage. It narrows the search; it does not clear
// a site.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Band plan ───────────────────────────────────────────────────────────────

pub struct BandDef {
    pub name: &'static str,
    pub lo: f64,
    pub hi: f64,
}

/// In-use bands for the Dock 3 / M4TD / D-RTK 3 stack, plus RTK GNSS reception.
pub const BANDS: &[BandDef] = &[
    BandDef { name: "sub-2G 902-928", lo: 902.0,  hi: 928.0 },
    BandDef { name: "2.4 GHz",        lo: 2400.0, hi: 2483.5 },
    BandDef { name: "5.2 GHz",        lo: 5150.0, hi: 5250.0 },
    BandDef { name: "5.8 GHz",        lo: 5725.0, hi: 5850.0 },
    BandDef { name: "RTK L-band",     lo: 1160.0, hi: 1610.0 },
];

/// Out-of-band ranges that can still desense the receiver front end at high
/// power and short range. Frequency separation does not protect a receiver
/// from a transmitter parked on the same rooftop — broadcast is here because
/// of field strength, not proximity in spectrum.
///
/// The 0.70 weight was calibrated on C-band against RCSO ground truth. It is
/// reused for broadcast on the argument that the mechanism is the same
/// (front-end overload), but that has NOT been validated against a site where
/// broadcast is the known culprit. Revisit once one is measured.
pub const DESENSE: &[BandDef] = &[
    BandDef { name: "C-band 5G", lo: 3700.0, hi: 3980.0 },
    BandDef { name: "FM broadcast", lo: 88.0, hi: 108.0 },
    // TV carries far more power than FM — a full-power UHF station runs to
    // 1000 kW ERP — and UHF sits closer to the 902-928 band than FM does.
    BandDef { name: "TV VHF-lo", lo: 54.0, hi: 88.0 },
    BandDef { name: "TV VHF-hi", lo: 174.0, hi: 216.0 },
    BandDef { name: "TV UHF", lo: 470.0, hi: 608.0 },
];

/// Adjacent-band guard window (MHz) each side of an in-use band.
pub const GUARD_MHZ: f64 = 100.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BandClass {
    In,
    Adj,
    Des,
    Clr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandMatch {
    pub cls: BandClass,
    pub label: String,
}

pub fn classify_band(freq_mhz: f64) -> BandMatch {
    for b in BANDS {
        if freq_mhz >= b.lo && freq_mhz <= b.hi {
            return BandMatch { cls: BandClass::In, label: b.name.to_string() };
        }
    }
    for b in BANDS {
        if freq_mhz >= b.lo - GUARD_MHZ && freq_mhz <= b.hi + GUARD_MHZ {
            return BandMatch { cls: BandClass::Adj, label: format!("adj {}", b.name) };
        }
    }
    for d in DESENSE {
        if freq_mhz >= d.lo && freq_mhz <= d.hi {
            return BandMatch { cls: BandClass::Des, label: format!("{} desense", d.name) };
        }
    }
    BandMatch { cls: BandClass::Clr, label: "out of band".to_string() }
}

// ── Geometry ────────────────────────────────────────────────────────────────

const EARTH_R: f64 = 6_371_000.0;

pub fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let d_la = (lat2 - lat1).to_radians();
    let d_lo = (lon2 - lon1).to_radians();
    let a = (d_la / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lo / 2.0).sin().powi(2);
    2.0 * EARTH_R * a.sqrt().min(1.0).asin()
}

/// Initial bearing from point 1 to point 2, degrees 0..360 (0 = true north).
pub fn bearing_deg(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (la1, la2) = (lat1.to_radians(), lat2.to_radians());
    let d_lo = (lon2 - lon1).to_radians();
    let y = d_lo.sin() * la2.cos();
    let x = la1.cos() * la2.sin() - la1.sin() * la2.cos() * d_lo.cos();
    (y.atan2(x).to_degrees() + 360.0) % 360.0
}

/// Destination point given start, bearing (deg) and distance (m).
pub fn dest_point(lat: f64, lon: f64, brg_deg: f64, dist_m: f64) -> (f64, f64) {
    let d_r = dist_m / EARTH_R;
    let br = brg_deg.to_radians();
    let la1 = lat.to_radians();
    let lo1 = lon.to_radians();
    let la2 = (la1.sin() * d_r.cos() + la1.cos() * d_r.sin() * br.cos()).asin();
    let lo2 = lo1
        + (br.sin() * d_r.sin() * la1.cos()).atan2(d_r.cos() - la1.sin() * la2.sin());
    (la2.to_degrees(), ((lo2.to_degrees() + 540.0) % 360.0) - 180.0)
}

/// 4/3-earth radio horizon in meters from two antenna heights (m).
/// Geometry only — no terrain. The DEM resolver supersedes this when
/// elevation data is available.
pub fn radio_horizon_m(h1_m: f64, h2_m: f64) -> f64 {
    4120.0 * (h1_m.max(0.0).sqrt() + h2_m.max(0.0).sqrt())
}

/// Normalize an ERP value to dBW. Guards log(0).
pub fn erp_to_dbw(value: f64, unit: &str) -> f64 {
    let mut v = if value.is_finite() { value } else { 0.0 };
    match unit {
        "dBW" => v,
        _ => {
            if unit == "kW" {
                v *= 1000.0;
            }
            if v > 0.0 {
                10.0 * v.log10()
            } else {
                -60.0
            }
        }
    }
}

// ── Core types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dock {
    pub lat: f64,
    pub lon: f64,
    pub antenna_agl_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Emitter {
    pub id: String,
    pub name: String,
    pub source: String,
    pub lat: f64,
    pub lon: f64,
    pub freq_mhz: f64,
    /// None when the licence record carries no power figure, which is common.
    /// Distinct from a genuinely low ERP — see `erp_factor`.
    pub erp_dbw: Option<f64>,
    pub height_agl_m: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Weights {
    pub band: f64,
    pub dist: f64,
    pub erp: f64,
    pub los: f64,
}

impl Default for Weights {
    fn default() -> Self {
        Weights { band: 35.0, dist: 30.0, erp: 15.0, los: 20.0 }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskTier {
    Low,
    Elevated,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Verdict {
    Go,
    FieldVerify,
    LikelyBad,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Factors {
    pub band: f64,
    pub dist: f64,
    pub erp: f64,
    pub los: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredEmitter {
    pub emitter: Emitter,
    pub bearing_deg: f64,
    pub distance_m: f64,
    pub band: BandMatch,
    pub los: bool,
    pub los_source: String, // "dem" | "horizon"
    /// False when the ERP factor came from the unknown-power default.
    pub erp_known: bool,
    pub radio_horizon_m: f64,
    pub factors: Factors,
    pub score: i32,
    pub tier: RiskTier,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurveyResult {
    pub dock: Dock,
    pub radius_km: f64,
    pub weights: Weights,
    pub scored: Vec<ScoredEmitter>,
    pub verdict: Verdict,
    pub worst_score: i32,
    pub flagged_count: usize,
    pub generated_at: String,
}

// ── Factor curves ───────────────────────────────────────────────────────────

pub fn band_factor(cls: BandClass) -> f64 {
    match cls {
        BandClass::In => 1.0,
        BandClass::Adj => 0.6,
        // Raised 0.45 -> 0.70 on RCSO ground truth (visible C-band tower, hard
        // drops). Revisit if false positives appear.
        BandClass::Des => 0.70,
        BandClass::Clr => 0.15,
    }
}

pub fn dist_factor(dist_m: f64) -> f64 {
    if dist_m < 150.0 {
        1.0
    } else if dist_m < 500.0 {
        0.75
    } else if dist_m < 1500.0 {
        0.45
    } else if dist_m < 5000.0 {
        0.2
    } else {
        0.05
    }
}

/// Unknown power is not low power. Treating a missing ERP as 0 dBW dropped it
/// to the 0.2 floor, which quietly under-scored every licence that omits the
/// field — and plenty do. Unknown now takes the moderate-power value, the
/// reasonable prior for a licensed transmitter, and the result is marked so a
/// reader can see the figure was assumed rather than measured.
pub fn erp_factor(dbw: Option<f64>) -> f64 {
    match dbw {
        None => 0.4,
        Some(v) if v >= 60.0 => 1.0,
        Some(v) if v >= 40.0 => 0.7,
        Some(v) if v >= 20.0 => 0.4,
        Some(_) => 0.2,
    }
}

pub fn los_factor(los: bool) -> f64 {
    if los { 1.0 } else { 0.35 }
}

pub fn tier_of(score: i32) -> RiskTier {
    if score >= 65 {
        RiskTier::Critical
    } else if score >= 40 {
        RiskTier::Elevated
    } else {
        RiskTier::Low
    }
}

pub fn verdict_of(worst: i32) -> Verdict {
    if worst >= 65 {
        Verdict::LikelyBad
    } else if worst >= 40 {
        Verdict::FieldVerify
    } else {
        Verdict::Go
    }
}

// ── Scoring ─────────────────────────────────────────────────────────────────

pub fn score_emitter(
    dock: &Dock,
    e: &Emitter,
    weights: &Weights,
    los_override: Option<bool>,
) -> ScoredEmitter {
    let distance_m = haversine_m(dock.lat, dock.lon, e.lat, e.lon);
    let bearing = bearing_deg(dock.lat, dock.lon, e.lat, e.lon);
    let band = classify_band(e.freq_mhz);
    let horizon = radio_horizon_m(dock.antenna_agl_m, e.height_agl_m);

    // Terrain result wins when we have one; otherwise fall back to pure
    // radio-horizon geometry so a missing DEM never blocks a survey.
    let (in_los, los_source) = match los_override {
        Some(v) => (v, "dem"),
        None => (distance_m <= horizon, "horizon"),
    };

    let factors = Factors {
        band: band_factor(band.cls),
        dist: dist_factor(distance_m),
        erp: erp_factor(e.erp_dbw),
        los: los_factor(in_los),
    };

    let total_w = {
        let w = weights.band + weights.dist + weights.erp + weights.los;
        if w == 0.0 { 1.0 } else { w }
    };
    let raw = weights.band * factors.band
        + weights.dist * factors.dist
        + weights.erp * factors.erp
        + weights.los * factors.los;
    let score = ((100.0 * raw) / total_w).round() as i32;

    ScoredEmitter {
        emitter: e.clone(),
        bearing_deg: bearing,
        distance_m,
        band,
        los: in_los,
        los_source: los_source.to_string(),
        erp_known: e.erp_dbw.is_some(),
        radio_horizon_m: horizon,
        factors,
        score,
        tier: tier_of(score),
    }
}

pub fn run_survey(
    dock: &Dock,
    emitters: &[Emitter],
    radius_km: f64,
    weights: Weights,
    los_map: &HashMap<String, bool>,
) -> SurveyResult {
    let mut scored: Vec<ScoredEmitter> = emitters
        .iter()
        .map(|e| score_emitter(dock, e, &weights, los_map.get(&e.id).copied()))
        .collect();
    scored.sort_by(|a, b| b.score.cmp(&a.score));

    let worst_score = scored.first().map(|s| s.score).unwrap_or(0);
    let flagged_count = scored.iter().filter(|s| s.score >= 40).count();

    SurveyResult {
        dock: *dock,
        radius_km,
        weights,
        scored,
        verdict: verdict_of(worst_score),
        worst_score,
        flagged_count,
        generated_at: chrono::Utc::now().to_rfc3339(),
    }
}

// ── Terrain line of sight ───────────────────────────────────────────────────

const K_EARTH: f64 = 4.0 / 3.0;

fn elevation_host() -> String {
    std::env::var("RF_ELEVATION_HOST").unwrap_or_else(|_| "https://api.opentopodata.org".to_string())
}
fn elevation_dataset() -> String {
    std::env::var("RF_ELEVATION_DATASET").unwrap_or_else(|_| "ned10m".to_string())
}

/// Ground elevations (m MSL) for each point, in order. Chunked to 100 per
/// request, which is the public OpenTopoData limit.
pub async fn fetch_elevations(
    http: &reqwest::Client,
    points: &[(f64, f64)],
) -> anyhow::Result<Vec<f64>> {
    let host = elevation_host();
    let dataset = elevation_dataset();
    let mut out = Vec::with_capacity(points.len());

    for chunk in points.chunks(100) {
        let locs = chunk
            .iter()
            .map(|(la, lo)| format!("{la:.6},{lo:.6}"))
            .collect::<Vec<_>>()
            .join("|");
        let url = format!("{host}/v1/{dataset}");
        let res = http
            .get(&url)
            .query(&[("locations", locs.as_str())])
            .header("Accept", "application/json")
            .send()
            .await?;
        if !res.status().is_success() {
            anyhow::bail!("elevation provider {}", res.status());
        }
        let body: serde_json::Value = res.json().await?;
        let results = body
            .get("results")
            .and_then(|r| r.as_array())
            .ok_or_else(|| anyhow::anyhow!("elevation provider returned no results"))?;
        for r in results {
            out.push(r.get("elevation").and_then(|e| e.as_f64()).unwrap_or(0.0));
        }
    }
    Ok(out)
}

/// Terrain LOS for every emitter in one batched elevation fetch.
///
/// Emitters absent from the returned map had no usable terrain data; callers
/// fall back to radio-horizon geometry for those rather than over-blocking.
pub async fn resolve_los_all(
    http: &reqwest::Client,
    dock: &Dock,
    emitters: &[Emitter],
    samples: usize,
) -> HashMap<String, bool> {
    let mut map = HashMap::new();
    if emitters.is_empty() {
        return map;
    }
    let samples = samples.clamp(8, 64);

    // Build every sample path up front so the whole survey costs one batched
    // round trip rather than one per emitter.
    let mut points: Vec<(f64, f64)> = Vec::new();
    let mut spans: Vec<(String, f64, usize)> = Vec::new(); // (id, distance, n points)

    for e in emitters {
        let d = haversine_m(dock.lat, dock.lon, e.lat, e.lon);
        if d < 1.0 {
            map.insert(e.id.clone(), true);
            continue;
        }
        let brg = bearing_deg(dock.lat, dock.lon, e.lat, e.lon);
        for i in 0..=samples {
            let along = d * (i as f64) / (samples as f64);
            points.push(dest_point(dock.lat, dock.lon, brg, along));
        }
        spans.push((e.id.clone(), d, samples + 1));
    }
    if points.is_empty() {
        return map;
    }

    let elev = match fetch_elevations(http, &points).await {
        Ok(v) if v.len() == points.len() => v,
        // Provider down or truncated — leave the map empty and let every
        // emitter fall back to horizon geometry.
        _ => return map,
    };

    let mut cursor = 0usize;
    for (id, dist, n) in spans {
        let seg = &elev[cursor..cursor + n];
        cursor += n;

        let emitter = match emitters.iter().find(|e| e.id == id) {
            Some(e) => e,
            None => continue,
        };
        let h_a = seg[0] + dock.antenna_agl_m;
        let h_b = seg[n - 1] + emitter.height_agl_m;

        let mut clear = true;
        for i in 1..n - 1 {
            let d1 = dist * (i as f64) / ((n - 1) as f64);
            let d2 = dist - d1;
            let line_h = h_a + (h_b - h_a) * (d1 / dist);
            let bulge = (d1 * d2) / (2.0 * K_EARTH * EARTH_R);
            if line_h - (seg[i] + bulge) < 0.0 {
                clear = false;
                break;
            }
        }
        map.insert(id, clear);
    }
    map
}

// ── Field sweep checklist ───────────────────────────────────────────────────

fn fmt_dist(m: f64) -> String {
    if m >= 1000.0 {
        format!("{:.2} km", m / 1000.0)
    } else {
        format!("{} m", m.round() as i64)
    }
}

fn tier_text(t: RiskTier) -> &'static str {
    match t {
        RiskTier::Critical => "CRITICAL",
        RiskTier::Elevated => "ELEVATED",
        RiskTier::Low => "LOW",
    }
}

fn verdict_text(v: Verdict) -> &'static str {
    match v {
        Verdict::Go => "GO",
        Verdict::FieldVerify => "FIELD-VERIFY",
        Verdict::LikelyBad => "LIKELY-BAD",
    }
}

/// Bearing sectors reported in the checklist, worst-first. A tech will not
/// work through more than this many headings in a session; the rest stay in
/// the app's table rather than padding a printout.
const CHECKLIST_SECTORS: usize = 12;
/// Matches the ±10° aim tolerance the checklist already instructs.
const SECTOR_HALF_WIDTH: i64 = 10;

struct Sector<'a> {
    bearing: i64,
    worst: &'a ScoredEmitter,
    count: usize,
    nearest_m: f64,
    freq_lo: f64,
    freq_hi: f64,
    bands: Vec<String>,
}

/// Collapse flagged emitters into 20°-wide bearing sectors, worst-first.
fn group_by_bearing<'a>(flagged: &[&'a ScoredEmitter]) -> Vec<Sector<'a>> {
    let width = (SECTOR_HALF_WIDTH * 2) as f64;
    let mut buckets: HashMap<i64, Vec<&'a ScoredEmitter>> = HashMap::new();
    for s in flagged {
        let key = ((s.bearing_deg / width).round() as i64 * width as i64).rem_euclid(360);
        buckets.entry(key).or_default().push(s);
    }

    let mut out: Vec<Sector<'a>> = buckets
        .into_iter()
        .map(|(bearing, members)| {
            // members inherit the worst-first order of result.scored
            let worst = members[0];
            let nearest_m = members.iter().map(|m| m.distance_m).fold(f64::MAX, f64::min);
            let freq_lo = members.iter().map(|m| m.emitter.freq_mhz).fold(f64::MAX, f64::min);
            let freq_hi = members.iter().map(|m| m.emitter.freq_mhz).fold(f64::MIN, f64::max);
            let mut bands: Vec<String> = members
                .iter()
                .map(|m| format!("{:?}", m.band.cls).to_uppercase())
                .collect();
            bands.sort();
            bands.dedup();
            Sector { bearing, worst, count: members.len(), nearest_m, freq_lo, freq_hi, bands }
        })
        .collect();

    out.sort_by(|a, b| b.worst.score.cmp(&a.worst.score).then(a.bearing.cmp(&b.bearing)));
    out
}

/// The safety and "does not clear the site" language is intentional and
/// non-optional — this output goes in a tech's hands.
pub fn build_checklist(result: &SurveyResult) -> String {
    let d = &result.dock;
    let mut l: Vec<String> = Vec::new();

    l.push("DXD RF SITE SURVEY — FIELD SWEEP CHECKLIST".into());
    l.push(format!(
        "Dock: {:.5}, {:.5}  ·  Ant {} m AGL  ·  {}",
        d.lat, d.lon, d.antenna_agl_m, result.generated_at
    ));
    l.push(format!("Verdict: {}", verdict_text(result.verdict)));
    l.push(String::new());

    l.push("# 1 — Baseline sweep (all sites)".into());
    l.push("At the dock, with a directional antenna + 10-20 dB attenuator, sweep and log the noise floor for:".into());
    for b in BANDS {
        l.push(format!("   · {}  ({}-{} MHz)", b.name, b.lo, b.hi));
    }
    for x in DESENSE {
        l.push(format!("   · {} watch  ({}-{} MHz)", x.name, x.lo, x.hi));
    }
    l.push(String::new());

    l.push("# 2 — Targeted bearings (from triage)".into());
    let flagged: Vec<&ScoredEmitter> = result.scored.iter().filter(|s| s.score >= 40).collect();
    if flagged.is_empty() {
        l.push("   None flagged. Confirm baseline is clean, then run the link test.".into());
    } else {
        // Grouped by bearing, not listed per emitter. A tech sweeps a heading,
        // and a single tower carries many licensed frequencies — at a dense
        // site this is the difference between 12 sweeps and 300 line items.
        let sectors = group_by_bearing(&flagged);
        l.push(format!(
            "   {} emitters at or above risk 40, in {} bearing sector{}. Sweep worst-first;",
            flagged.len(),
            sectors.len(),
            if sectors.len() == 1 { "" } else { "s" }
        ));
        l.push("   each entry below is one antenna heading, not one transmitter.".into());
        l.push(String::new());

        for (i, sec) in sectors.iter().take(CHECKLIST_SECTORS).enumerate() {
            let w = sec.worst;
            l.push(format!(
                "   [{}] Bearing {:03}° (±{}°) — worst risk {} ({}), {} emitter{}",
                i + 1,
                sec.bearing,
                SECTOR_HALF_WIDTH,
                w.score,
                tier_text(w.tier),
                sec.count,
                if sec.count == 1 { "" } else { "s" }
            ));
            l.push(format!(
                "       Nearest {} · {} · bands {}",
                fmt_dist(sec.nearest_m),
                if (sec.freq_lo - sec.freq_hi).abs() < 0.001 {
                    format!("{:.3} MHz", sec.freq_lo)
                } else {
                    format!("{:.3}-{:.3} MHz", sec.freq_lo, sec.freq_hi)
                },
                sec.bands.join("/")
            ));
            l.push(format!(
                "       Strongest: {} at {:.3} MHz, ERP {}, LOS {}",
                w.emitter.name,
                w.emitter.freq_mhz,
                match w.emitter.erp_dbw {
                    Some(v) => format!("{} dBW", v.round() as i64),
                    None => "unknown (scored as moderate)".to_string(),
                },
                if w.los { "yes — desense candidate" } else { "no (beyond radio horizon)" }
            ));
        }

        if sectors.len() > CHECKLIST_SECTORS {
            let rest: usize = sectors.iter().skip(CHECKLIST_SECTORS).map(|s| s.count).sum();
            l.push(String::new());
            l.push(format!(
                "   + {} further sector{} ({} emitters) below risk {}. Full table in the app.",
                sectors.len() - CHECKLIST_SECTORS,
                if sectors.len() - CHECKLIST_SECTORS == 1 { "" } else { "s" },
                rest,
                sectors[CHECKLIST_SECTORS].worst.score
            ));
        }
    }
    l.push(String::new());

    l.push("# 3 — Confirm the mechanism".into());
    l.push("   · Band-lock test: fly the suspect bearing on 2.4 GHz only, then 5.8 GHz only. Same drop distance on both = LOS/link-budget, not interference.".into());
    l.push("   · Watch SNR on approach. Sharp collapse + rising noise floor = interference. Gradual decay = range/obstruction.".into());
    l.push(String::new());

    l.push("!! SAFETY".into());
    l.push("   Treat any flagged bearing as NO-FLY until root-caused. Geofence/cap range on that azimuth so a mission cannot push the aircraft into the dropout zone.".into());
    l.push("   This desktop triage narrows the search. It does NOT clear the site. On-site sweep + live link-margin check required before deployment.".into());

    l.join("\n")
}
