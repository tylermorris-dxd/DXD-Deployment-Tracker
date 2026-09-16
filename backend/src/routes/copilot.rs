// Agentic Fleet Copilot.
//
// The existing /claude route is a hardened passthrough: the browser stuffs
// whatever context it has into a system prompt and gets one answer back. That
// ceiling is real — it can only ever discuss what the page already loaded, so
// "which deals have a critical RF risk" is unanswerable.
//
// This runs the tool loop server-side instead. Claude is given tools that reach
// the actual database, the RF engine and the coverage solver; it decides what to
// call, the results come back, and it keeps going until it can answer. Tools
// execute here rather than in the browser so they run with server authority and
// a question costs one request instead of a round trip per step.
//
// Raw HTTP rather than an SDK because there is no official Anthropic SDK for
// Rust. Wire shapes follow the Messages API tool-use contract: every tool_use
// block in a turn must come back as tool_result blocks in a SINGLE user
// message, a failed tool returns is_error rather than being dropped, and the
// assistant's content array is echoed back verbatim — including thinking
// blocks, which must not be stripped when continuing on the same model.

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;

use crate::{
    coverage::{self, Aircraft, CoverageRequest, LatLon},
    error::AppError,
    rf::Dock,
    routes::{misc::AppState, rf_survey},
};

const MODEL: &str = "claude-opus-5";
const MAX_TOKENS: u32 = 16_000;
/// Each iteration is one API round trip. Eight is enough for a question that
/// needs to survey a site, then check the schedule, then reason about both.
const MAX_ITERATIONS: usize = 8;
const MAX_HISTORY: usize = 40;
const MAX_MESSAGE_CHARS: usize = 20_000;
/// Tool output is context. A tool that dumps 4,000 deals crowds out the reasoning.
const MAX_TOOL_RESULT_CHARS: usize = 24_000;

pub fn router() -> Router<AppState> {
    Router::new().route("/copilot", post(chat))
}

#[derive(Debug, Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotRequest {
    pub messages: Vec<ChatTurn>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolTrace {
    pub name: String,
    pub input: Value,
    /// Short human summary, so the UI can show its work without the payload.
    pub summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotResponse {
    pub reply: String,
    pub tools: Vec<ToolTrace>,
    pub iterations: usize,
    /// True when the loop stopped on the iteration cap rather than because
    /// Claude was finished — the answer may be partial.
    pub truncated: bool,
}

// ── Tool definitions ────────────────────────────────────────────────────────

fn tool_defs() -> Value {
    json!([
      {
        "name": "list_deals",
        "description": "List every deal (project) with its client, site address, install schedule and whether it is a live deployment. Use this first when a question spans more than one deal, or to find a deal's id before calling another tool.",
        "input_schema": {
          "type": "object",
          "properties": {
            "only_scheduled": { "type": "boolean", "description": "Only deals with an install date set." },
            "only_deployed": { "type": "boolean", "description": "Only deals already live (active deployments)." }
          }
        }
      },
      {
        "name": "get_deal",
        "description": "Full detail for one deal: client, site, stage progress, install schedule, assigned tech and scheduling notes.",
        "input_schema": {
          "type": "object",
          "properties": { "deal_id": { "type": "string" } },
          "required": ["deal_id"]
        }
      },
      {
        "name": "rf_survey",
        "description": "Run an RF desense survey at a dock location. Scores licensed FCC emitters near the point for the chance they interfere with the control link, and returns a GO / FIELD_VERIFY / LIKELY_BAD verdict plus the worst offenders with bearing and range. Use when asked about interference, RF risk, or whether a site is clean.",
        "input_schema": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lon": { "type": "number" },
            "antenna_agl_m": { "type": "number", "description": "Dock antenna height above ground in metres. Defaults to 15." },
            "radius_km": { "type": "number", "description": "Search radius, default 5, max 25." }
          },
          "required": ["lat", "lon"]
        }
      },
      {
        "name": "optimize_coverage",
        "description": "Solve for the fewest dock positions covering a service area within a response-time SLA. Returns the dock count, their coordinates, and the coverage achieved. Use for 'how many docks do we need' questions. Reach accounts for launch delay, so a 90 s SLA is far less ground than people assume.",
        "input_schema": {
          "type": "object",
          "properties": {
            "area": {
              "type": "array",
              "description": "Service area boundary as [[lat, lon], ...], at least 3 points.",
              "items": { "type": "array", "items": { "type": "number" } }
            },
            "sla_seconds": { "type": "number", "description": "Response time target in seconds." },
            "target_pct": { "type": "number", "description": "Share of the area to cover, default 100." }
          },
          "required": ["area", "sla_seconds"]
        }
      },
      {
        "name": "install_schedule",
        "description": "Installs with a scheduled date, optionally within a window. Use for questions about what is coming up, who is assigned, or what is blocked.",
        "input_schema": {
          "type": "object",
          "properties": {
            "from_date": { "type": "string", "description": "Inclusive ISO date, e.g. 2026-09-01." },
            "to_date":   { "type": "string", "description": "Inclusive ISO date." }
          }
        }
      }
    ])
}

const SYSTEM: &str = "\
You are the Fleet Copilot inside the DXD Deployment Tracker, used by the Deus X \
Defense operations team and solutions architects who deploy DJI Dock 3 drone \
docks running DroneSense, plus DroneTag Scout Remote ID receivers. Many \
deployments are DFR (drone as first responder) programmes where response time \
is the thing the customer is actually buying.

Terminology in this product: a deal in the 'Solution Proposals' stage is being \
scoped; an 'Active Deployment' is live and running. Never call the latter \
'steady state' in what you write.

You have tools that reach the real database, the RF survey engine and the \
coverage optimiser. Use them rather than guessing — if you are asked about a \
site, survey it; if you are asked how many docks something needs, solve it. \
Call several tools in one turn when the question needs it.

Two things you should state plainly when they come up, because people get them \
wrong. Dock reach is cruise speed over the SLA MINUS the launch delay, so a \
Dock 3 at a 90 second SLA covers about 885 m, not 1,475 m. And registered \
structures in the RF data carry no frequency, so they are never scored — they \
are worth eyeballing on site but they are not evidence a site is clean.

Answer like a colleague who knows the work: lead with the answer, give the \
number that matters, and say when the data does not support a conclusion. Be \
concise. Do not pad with caveats nobody asked for.";

// ── Tool execution ──────────────────────────────────────────────────────────

fn truncate(mut s: String) -> String {
    if s.len() > MAX_TOOL_RESULT_CHARS {
        s.truncate(MAX_TOOL_RESULT_CHARS);
        s.push_str("\n…(truncated; narrow the query for the rest)");
    }
    s
}

/// Returns (result_json, short_summary). Errors become tool results too —
/// telling Claude what failed lets it recover, where a 500 ends the turn.
async fn exec_tool(state: &AppState, name: &str, input: &Value) -> (String, String) {
    match run_tool(state, name, input).await {
        Ok(pair) => pair,
        Err(e) => (json!({ "error": e }).to_string(), format!("{name} failed: {e}")),
    }
}

async fn run_tool(state: &AppState, name: &str, input: &Value) -> Result<(String, String), String> {
    match name {
        "list_deals" => {
            let only_sched = input.get("only_scheduled").and_then(|v| v.as_bool()).unwrap_or(false);
            let only_dep = input.get("only_deployed").and_then(|v| v.as_bool()).unwrap_or(false);
            let mut sql = String::from(
                "SELECT id, name, client, site, install_date, install_status, assigned_tech, \
                 steady_state, faa_authorization_required FROM projects WHERE 1=1",
            );
            if only_sched { sql.push_str(" AND install_date IS NOT NULL"); }
            if only_dep { sql.push_str(" AND steady_state = TRUE"); }
            sql.push_str(" ORDER BY install_date NULLS LAST, name LIMIT 400");

            let rows = sqlx::query(&sql).fetch_all(&state.pool).await.map_err(|e| e.to_string())?;
            let out: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "client": r.get::<String, _>("client"),
                "site": r.get::<String, _>("site"),
                "installDate": r.try_get::<Option<String>, _>("install_date").unwrap_or(None),
                "installStatus": r.try_get::<Option<String>, _>("install_status").unwrap_or(None),
                "assignedTech": r.try_get::<Option<String>, _>("assigned_tech").unwrap_or(None),
                "activeDeployment": r.get::<bool, _>("steady_state"),
                "faaTracking": r.get::<bool, _>("faa_authorization_required"),
            })).collect();
            let n = out.len();
            Ok((truncate(json!({ "deals": out }).to_string()), format!("listed {n} deals")))
        }

        "get_deal" => {
            let id = input.get("deal_id").and_then(|v| v.as_str())
                .ok_or("deal_id is required")?;
            let row = sqlx::query(
                "SELECT p.id, p.name, p.client, p.site, p.created_at, p.install_date, \
                        p.install_end_date, p.install_status, p.assigned_tech, p.schedule_notes, \
                        p.steady_state, p.faa_authorization_required, \
                        COUNT(t.id) AS total_tasks, \
                        SUM(CASE WHEN t.completed THEN 1 ELSE 0 END) AS done_tasks \
                 FROM projects p \
                 LEFT JOIN tasks t ON t.project_id = p.id \
                 WHERE p.id = $1 GROUP BY p.id",
            )
            .bind(id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("no deal with id {id}"))?;

            let name = row.get::<String, _>("name");
            let v = json!({
                "id": row.get::<String, _>("id"),
                "name": name,
                "client": row.get::<String, _>("client"),
                "site": row.get::<String, _>("site"),
                "installDate": row.try_get::<Option<String>, _>("install_date").unwrap_or(None),
                "installEndDate": row.try_get::<Option<String>, _>("install_end_date").unwrap_or(None),
                "installStatus": row.try_get::<Option<String>, _>("install_status").unwrap_or(None),
                "assignedTech": row.try_get::<Option<String>, _>("assigned_tech").unwrap_or(None),
                "scheduleNotes": row.try_get::<Option<String>, _>("schedule_notes").unwrap_or(None),
                "activeDeployment": row.get::<bool, _>("steady_state"),
                "faaTracking": row.get::<bool, _>("faa_authorization_required"),
                "tasksTotal": row.try_get::<Option<i64>, _>("total_tasks").unwrap_or(None),
                "tasksDone": row.try_get::<Option<i64>, _>("done_tasks").unwrap_or(None),
            });
            let summary = format!("read deal {}", row.get::<String, _>("name"));
            Ok((truncate(v.to_string()), summary))
        }

        "rf_survey" => {
            let lat = input.get("lat").and_then(|v| v.as_f64()).ok_or("lat is required")?;
            let lon = input.get("lon").and_then(|v| v.as_f64()).ok_or("lon is required")?;
            let ant = input.get("antenna_agl_m").and_then(|v| v.as_f64()).unwrap_or(15.0);
            let radius = input.get("radius_km").and_then(|v| v.as_f64()).unwrap_or(5.0).clamp(0.1, 25.0);

            let req = rf_survey::SurveyRequest {
                dock: Dock { lat, lon, antenna_agl_m: ant },
                radius_km: Some(radius),
                weights: None,
                emitters: vec![],
                use_terrain: false,
            };
            let r = rf_survey::survey(state, &req).await.map_err(|e| format!("{e:?}"))?;

            let top: Vec<Value> = r.result.scored.iter().take(8).map(|s| json!({
                "name": s.emitter.name,
                "freqMhz": s.emitter.freq_mhz,
                "band": format!("{:?}", s.band.cls).to_uppercase(),
                "distanceM": s.distance_m.round(),
                "bearingDeg": s.bearing_deg.round(),
                "score": s.score,
                "tier": format!("{:?}", s.tier).to_lowercase(),
                "erpDbw": s.emitter.erp_dbw,
                "erpKnown": s.erp_known,
                "los": s.los,
            })).collect();
            let structures: Vec<Value> = r.result.structures.iter().take(5).map(|st| json!({
                "name": st.name,
                "heightAglM": st.height_agl_m,
                "distanceM": st.distance_m.round(),
                "bearingDeg": st.bearing_deg.round(),
            })).collect();

            let verdict = format!("{:?}", r.result.verdict).to_uppercase();
            let summary = format!(
                "RF survey at {lat:.4},{lon:.4}: {} (worst {}, {} flagged of {})",
                verdict, r.result.worst_score, r.result.flagged_count, r.db_emitter_count
            );
            let v = json!({
                "verdict": verdict,
                "worstScore": r.result.worst_score,
                "flaggedCount": r.result.flagged_count,
                "emittersInRadius": r.db_emitter_count,
                "emittersTruncated": r.emitters_truncated,
                "topEmitters": top,
                "unscoredStructures": structures,
                "note": "Structures carry no frequency and are never scored.",
            });
            Ok((truncate(v.to_string()), summary))
        }

        "optimize_coverage" => {
            let arr = input.get("area").and_then(|v| v.as_array())
                .ok_or("area is required")?;
            let mut area = Vec::new();
            for p in arr {
                let pair = p.as_array().ok_or("each area point must be [lat, lon]")?;
                let lat = pair.first().and_then(|v| v.as_f64()).ok_or("bad lat")?;
                let lon = pair.get(1).and_then(|v| v.as_f64()).ok_or("bad lon")?;
                area.push(LatLon { lat, lon });
            }
            let sla = input.get("sla_seconds").and_then(|v| v.as_f64()).ok_or("sla_seconds is required")?;
            let target = input.get("target_pct").and_then(|v| v.as_f64()).unwrap_or(100.0).clamp(1.0, 100.0);

            let req = CoverageRequest {
                area,
                sla_seconds: sla.clamp(1.0, 3600.0),
                aircraft: Aircraft::default(),
                wind: None,
                max_docks: 200,
                target_pct: target,
                demand_spacing_m: 200.0,
                candidate_spacing_m: 400.0,
            };
            let r = coverage::optimize(&req)?;
            let summary = format!(
                "coverage solve: {} docks for {:.1}% at {:.0}s SLA",
                r.docks.len(), r.coverage_pct, r.sla_seconds
            );
            let v = json!({
                "docks": r.docks.len(),
                "coveragePct": r.coverage_pct,
                "stillAirReachM": r.still_air_reach_m,
                "hitDockLimit": r.hit_dock_limit,
                "demandPoints": r.demand_total,
                "positions": r.docks.iter().take(30).map(|d| json!({
                    "lat": d.lat, "lon": d.lon, "adds": d.adds, "cumulativePct": d.cumulative_pct
                })).collect::<Vec<_>>(),
            });
            Ok((truncate(v.to_string()), summary))
        }

        "install_schedule" => {
            let from = input.get("from_date").and_then(|v| v.as_str());
            let to = input.get("to_date").and_then(|v| v.as_str());
            let rows = sqlx::query(
                "SELECT id, name, client, site, install_date, install_end_date, \
                        install_status, assigned_tech, schedule_notes \
                 FROM projects \
                 WHERE install_date IS NOT NULL \
                   AND ($1::text IS NULL OR install_date >= $1) \
                   AND ($2::text IS NULL OR install_date <= $2) \
                 ORDER BY install_date LIMIT 300",
            )
            .bind(from)
            .bind(to)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| e.to_string())?;

            let out: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "client": r.get::<String, _>("client"),
                "site": r.get::<String, _>("site"),
                "installDate": r.try_get::<Option<String>, _>("install_date").unwrap_or(None),
                "installEndDate": r.try_get::<Option<String>, _>("install_end_date").unwrap_or(None),
                "installStatus": r.try_get::<Option<String>, _>("install_status").unwrap_or(None),
                "assignedTech": r.try_get::<Option<String>, _>("assigned_tech").unwrap_or(None),
                "scheduleNotes": r.try_get::<Option<String>, _>("schedule_notes").unwrap_or(None),
            })).collect();
            let n = out.len();
            Ok((truncate(json!({ "installs": out }).to_string()), format!("{n} scheduled installs")))
        }

        other => Err(format!("unknown tool '{other}'")),
    }
}

// ── The loop ────────────────────────────────────────────────────────────────

async fn chat(
    State(state): State<AppState>,
    Json(body): Json<CopilotRequest>,
) -> Result<Json<CopilotResponse>, AppError> {
    if body.messages.is_empty() {
        return Err(AppError::BadRequest("messages must not be empty".into()));
    }
    if body.messages.len() > MAX_HISTORY {
        return Err(AppError::BadRequest("conversation is too long".into()));
    }
    for m in &body.messages {
        if m.role != "user" && m.role != "assistant" {
            return Err(AppError::BadRequest("message role must be user or assistant".into()));
        }
        if m.content.len() > MAX_MESSAGE_CHARS {
            return Err(AppError::BadRequest("message is too large".into()));
        }
    }

    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        AppError::Internal("ANTHROPIC_API_KEY is not configured on the server.".into())
    })?;

    let mut messages: Vec<Value> = body
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let tools = tool_defs();
    let mut traces: Vec<ToolTrace> = Vec::new();

    for iteration in 1..=MAX_ITERATIONS {
        let payload = json!({
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM,
            "tools": tools,
            "messages": messages,
            // Adaptive thinking is on by default for this model; asking for a
            // summary keeps the reasoning inspectable if it is ever surfaced.
            "thinking": { "type": "adaptive", "display": "summarized" },
            "output_config": { "effort": "high" },
        });

        let res = state
            .http
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Anthropic request failed: {e}")))?;

        let status = res.status();
        let body_json: Value = res
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Anthropic returned invalid JSON: {e}")))?;

        if !status.is_success() {
            let msg = body_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("unknown error");
            return Err(AppError::Internal(format!("Anthropic {status}: {msg}")));
        }

        let stop = body_json.get("stop_reason").and_then(|v| v.as_str()).unwrap_or("");

        // Guard before reading content: a refusal carries no usable answer.
        if stop == "refusal" {
            let why = body_json
                .get("stop_details")
                .and_then(|d| d.get("explanation"))
                .and_then(|v| v.as_str())
                .unwrap_or("the request was declined by safety classifiers");
            return Ok(Json(CopilotResponse {
                reply: format!("I can't answer that one — {why}."),
                tools: traces,
                iterations: iteration,
                truncated: false,
            }));
        }

        let content = body_json
            .get("content")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        if stop != "tool_use" {
            let reply = content
                .iter()
                .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string();
            return Ok(Json(CopilotResponse {
                reply: if reply.is_empty() { "No answer was produced.".into() } else { reply },
                tools: traces,
                iterations: iteration,
                truncated: false,
            }));
        }

        // Echo the assistant turn back verbatim. Thinking blocks must survive
        // unchanged when continuing on the same model.
        messages.push(json!({ "role": "assistant", "content": content }));

        // Every tool_use in this turn must be answered, and all the results
        // must ride in ONE user message — splitting them teaches the model to
        // stop making parallel calls.
        let mut results: Vec<Value> = Vec::new();
        for block in &content {
            if block.get("type").and_then(|t| t.as_str()) != Some("tool_use") {
                continue;
            }
            let id = block.get("id").and_then(|v| v.as_str()).unwrap_or_default();
            let name = block.get("name").and_then(|v| v.as_str()).unwrap_or_default();
            let empty = json!({});
            let input = block.get("input").unwrap_or(&empty);

            let (payload, summary) = exec_tool(&state, name, input).await;
            let is_error = payload.contains("\"error\"");
            traces.push(ToolTrace {
                name: name.to_string(),
                input: input.clone(),
                summary,
            });
            results.push(json!({
                "type": "tool_result",
                "tool_use_id": id,
                "content": payload,
                "is_error": is_error,
            }));
        }

        if results.is_empty() {
            return Err(AppError::Internal("model asked for tools but named none".into()));
        }
        messages.push(json!({ "role": "user", "content": results }));
    }

    Ok(Json(CopilotResponse {
        reply: "I ran out of steps before finishing that. Try narrowing the question.".into(),
        tools: traces,
        iterations: MAX_ITERATIONS,
        truncated: true,
    }))
}
