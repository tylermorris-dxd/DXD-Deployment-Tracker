// Proxy fetcher for OEM specification pages.
//
// The Drone TEVI Products tool lets evaluators paste a URL where the OEM
// publishes the drone's specifications (flight time, range, IP rating, etc).
// Pulling that page directly from the browser fails on CORS for most OEM
// sites, so we proxy the fetch server-side and return the page text. The
// frontend then sends the text to the existing /api/claude proxy to extract
// structured specs and pre-fill the evaluation matrix.

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::AppError, routes::misc::AppState};

const MAX_RESPONSE_BYTES: usize = 2_000_000; // 2MB cap so we don't blow up the prompt
const FETCH_TIMEOUT_SECS: u64 = 15;

pub fn router() -> Router<AppState> {
    Router::new().route("/oem-specs-fetch", get(fetch_specs))
}

#[derive(Deserialize)]
struct FetchParams {
    url: String,
}

async fn fetch_specs(
    State(state): State<AppState>,
    Query(params): Query<FetchParams>,
) -> Result<Json<Value>, AppError> {
    let url = params.url.trim().to_string();
    if url.is_empty() {
        return Err(AppError::BadRequest("url is required".into()));
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(AppError::BadRequest(
            "url must start with http:// or https://".into(),
        ));
    }

    let resp = state
        .http
        .get(&url)
        .header(
            "User-Agent",
            "DXD-Deployment-Tracker/2.0 (OEM spec fetcher)",
        )
        .header("Accept", "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5")
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to fetch URL: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::BadRequest(format!(
            "Source returned HTTP {}",
            status.as_u16()
        )));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let raw = resp
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read response: {e}")))?;
    if raw.len() > MAX_RESPONSE_BYTES {
        return Err(AppError::BadRequest(format!(
            "Source response too large ({} bytes, max {})",
            raw.len(),
            MAX_RESPONSE_BYTES
        )));
    }

    let body = String::from_utf8_lossy(&raw).to_string();

    // Strip HTML tags + scripts + styles so the prompt isn't 90% markup.
    // Crude but effective for OEM marketing pages.
    let cleaned = strip_html(&body);

    Ok(Json(json!({
        "url": url,
        "contentType": content_type,
        "text": cleaned,
        "rawLen": raw.len(),
        "cleanLen": cleaned.len(),
    })))
}

fn strip_html(s: &str) -> String {
    // Quick path
    if !s.contains('<') {
        return s.to_string();
    }
    let lower = s.to_lowercase();
    let mut out = String::with_capacity(s.len() / 2);
    let mut in_tag = false;
    let mut skip_until: Option<&'static str> = None; // "</script" or "</style"
    let mut i: usize = 0;
    let total = s.len();
    while i < total {
        // Find the next char boundary safely
        if !s.is_char_boundary(i) {
            i += 1;
            continue;
        }
        if let Some(close) = skip_until {
            if let Some(idx) = lower[i..].find(close) {
                i += idx + close.len();
                // advance past the rest of the closing tag
                if let Some(rel) = s[i..].find('>') {
                    i += rel + 1;
                }
                skip_until = None;
                continue;
            } else {
                break;
            }
        }
        let rest = &s[i..];
        let lrest = &lower[i..];
        if rest.starts_with('<') {
            if lrest.starts_with("<script") {
                skip_until = Some("</script");
                if let Some(rel) = rest.find('>') { i += rel + 1; } else { break; }
                continue;
            } else if lrest.starts_with("<style") {
                skip_until = Some("</style");
                if let Some(rel) = rest.find('>') { i += rel + 1; } else { break; }
                continue;
            }
            in_tag = true;
            i += 1;
            continue;
        }
        if rest.starts_with('>') {
            in_tag = false;
            out.push(' ');
            i += 1;
            continue;
        }
        let ch = rest.chars().next().unwrap();
        if !in_tag {
            out.push(ch);
        }
        i += ch.len_utf8();
    }
    // Collapse runs of whitespace
    let mut collapsed = String::with_capacity(out.len());
    let mut last_ws = false;
    for ch in out.chars() {
        if ch.is_whitespace() {
            if !last_ws {
                collapsed.push(' ');
                last_ws = true;
            }
        } else {
            collapsed.push(ch);
            last_ws = false;
        }
    }
    collapsed.trim().to_string()
}
