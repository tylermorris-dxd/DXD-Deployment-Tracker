use axum::{extract::State, routing::post, Json, Router};
use serde_json::Value;

use crate::{error::AppError, routes::misc::AppState};

// Proxy for the Claude TEVI / Products tool's "Generate Executive Summary"
// button (and any other Anthropic API call from the frontend). The API key
// stays server-side via the ANTHROPIC_API_KEY env var; the browser just
// posts a messages-API-shaped body and gets the Anthropic JSON back.

pub fn router() -> Router<AppState> {
    Router::new().route("/claude", post(proxy))
}

async fn proxy(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        AppError::BadRequest(
            "ANTHROPIC_API_KEY is not configured on the server. Set it in Azure App Settings."
                .into(),
        )
    })?;

    let res = state
        .http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("Anthropic request failed: {e}")))?;

    let status = res.status();
    let response_body: Value = res
        .json()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse Anthropic response: {e}")))?;

    if !status.is_success() {
        // Surface the upstream error message so the user can see what went
        // wrong (invalid key, model name, etc.) instead of a generic "failed".
        let detail = response_body
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown Anthropic error")
            .to_string();
        return Err(AppError::BadRequest(format!(
            "Anthropic {}: {}",
            status.as_u16(),
            detail
        )));
    }

    Ok(Json(response_body))
}
