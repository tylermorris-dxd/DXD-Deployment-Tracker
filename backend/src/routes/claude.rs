// Hardened proxy for the Drone TEVI / Products tool's "Generate Executive
// Summary" buttons. Forwards a messages-API call to Anthropic using the
// server-side ANTHROPIC_API_KEY. Safeguards:
//   - Model whitelist (only models we actually use are accepted)
//   - max_tokens hard cap so a runaway prompt can't burn budget
//   - Per-message size + total message count limits
//   - Strict request shape — unknown fields from the client are dropped,
//     not forwarded blindly to Anthropic
//   - Anthropic error messages surfaced verbatim so the user can see why

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

use crate::{error::AppError, routes::misc::AppState};

// Models the frontend is allowed to request. Add new entries here as we
// adopt newer model versions; old IDs stay until the frontend stops
// using them.
const ALLOWED_MODELS: &[&str] = &[
    "claude-sonnet-4-6",
    "claude-opus-4-7",
    "claude-haiku-4-5-20251001",
];

// Hard server-side ceilings — frontend-supplied values are clamped /
// rejected against these regardless of what the client asks for.
const MAX_TOKENS_CAP: u32 = 4000;
const MAX_MESSAGES: usize = 50;
const MAX_MESSAGE_CHARS: usize = 90_000;
const MAX_SYSTEM_CHARS: usize = 10_000;

pub fn router() -> Router<AppState> {
    Router::new().route("/claude", post(proxy))
}

#[derive(Debug, Deserialize)]
struct ClaudeRequest {
    model: String,
    #[serde(default)]
    max_tokens: Option<u32>,
    messages: Vec<MessageInput>,
    #[serde(default)]
    system: Option<String>,
    #[serde(default)]
    temperature: Option<f32>,
}

#[derive(Debug, Deserialize, Serialize)]
struct MessageInput {
    role: String,
    content: String,
}

async fn proxy(
    State(state): State<AppState>,
    Json(body): Json<ClaudeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // 1. Model whitelist
    if !ALLOWED_MODELS.contains(&body.model.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Model '{}' is not in the allowed list. Permitted: {}",
            body.model,
            ALLOWED_MODELS.join(", ")
        )));
    }

    // 2. Messages array validation
    if body.messages.is_empty() {
        return Err(AppError::BadRequest("messages must not be empty".into()));
    }
    if body.messages.len() > MAX_MESSAGES {
        return Err(AppError::BadRequest(format!(
            "too many messages ({}). max allowed: {}",
            body.messages.len(),
            MAX_MESSAGES
        )));
    }
    for (i, m) in body.messages.iter().enumerate() {
        if m.role != "user" && m.role != "assistant" {
            return Err(AppError::BadRequest(format!(
                "messages[{i}].role must be 'user' or 'assistant', got '{}'",
                m.role
            )));
        }
        if m.content.is_empty() {
            return Err(AppError::BadRequest(format!(
                "messages[{i}].content cannot be empty"
            )));
        }
        if m.content.len() > MAX_MESSAGE_CHARS {
            return Err(AppError::BadRequest(format!(
                "messages[{i}].content too large ({} chars, max {})",
                m.content.len(),
                MAX_MESSAGE_CHARS
            )));
        }
    }

    // 3. System prompt size cap
    if let Some(s) = &body.system {
        if s.len() > MAX_SYSTEM_CHARS {
            return Err(AppError::BadRequest(format!(
                "system prompt too large ({} chars, max {})",
                s.len(),
                MAX_SYSTEM_CHARS
            )));
        }
    }

    // 4. Temperature range
    if let Some(t) = body.temperature {
        if !(0.0..=1.0).contains(&t) || t.is_nan() {
            return Err(AppError::BadRequest(
                "temperature must be a number between 0.0 and 1.0".into(),
            ));
        }
    }

    // 5. Clamp max_tokens to server cap (regardless of what client requested)
    let max_tokens = body.max_tokens.unwrap_or(1000).min(MAX_TOKENS_CAP).max(1);

    // 6. Fetch the server-side API key
    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        AppError::Internal(
            "ANTHROPIC_API_KEY is not configured on the server. Set it in Azure \
             App Settings, save, and wait for the App Service to restart."
                .into(),
        )
    })?;

    // 7. Build the outgoing payload from known fields ONLY. Anything else
    //    the client put in the body has already been dropped by serde.
    let mut payload = serde_json::json!({
        "model": body.model,
        "max_tokens": max_tokens,
        "messages": body.messages,
    });
    if let Some(s) = body.system {
        payload["system"] = serde_json::Value::String(s);
    }
    if let Some(t) = body.temperature {
        payload["temperature"] = serde_json::json!(t);
    }

    // 8. Call Anthropic
    let res = state
        .http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("Anthropic request failed: {e}")))?;

    let status = res.status();
    let response_body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse Anthropic response: {e}")))?;

    // 9. Surface upstream errors with their actual message instead of
    //    swallowing them into a generic "failed".
    if !status.is_success() {
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
