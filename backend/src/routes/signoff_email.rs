// Send a Customer Signoff PDF by email via Resend (https://resend.com).
//
// Reads two env vars at request time (not startup) so an operator can
// rotate keys without a redeploy:
//   RESEND_API_KEY          — required
//   SIGNOFF_EMAIL_FROM      — required, e.g. "signoff@deusxdefense.com"
//                              (or "onboarding@resend.dev" during setup)
//   SIGNOFF_EMAIL_RECIPIENT — optional default recipient; the request
//                              body's `to` still wins when present.
//
// Request body (JSON):
//   {
//     "to":         "tyler.morris@deusxdefense.com",   // optional
//     "subject":    "Customer Signoff — Acme HQ",       // optional
//     "project":    "Acme HQ Deployment",               // optional
//     "client":     "Acme Corporation",                 // optional
//     "site":       "1234 Main St, Dallas TX",          // optional
//     "filename":   "signoff-acme-2026-06-12.pdf",      // required
//     "pdf_base64": "<base64-encoded PDF bytes>"        // required
//   }
//
// Fails cleanly with a specific error message if the key/from env vars
// aren't configured — the frontend surfaces that message to the user.

use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::AppError, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/send-signoff-email", post(send))
}

#[derive(Deserialize)]
struct SendReq {
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    subject: Option<String>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    client: Option<String>,
    #[serde(default)]
    site: Option<String>,
    filename: String,
    pdf_base64: String,
}

async fn send(
    State(state): State<AppState>,
    Json(body): Json<SendReq>,
) -> Result<Json<Value>, AppError> {
    // Config
    let api_key = std::env::var("RESEND_API_KEY").map_err(|_| {
        AppError::Internal(
            "RESEND_API_KEY is not configured on the server. Set it in Azure \
             App Settings and restart the App Service."
                .into(),
        )
    })?;

    let from = std::env::var("SIGNOFF_EMAIL_FROM").map_err(|_| {
        AppError::Internal(
            "SIGNOFF_EMAIL_FROM is not configured. Set it in Azure App Settings \
             (e.g. \"DXD Signoff <signoff@yourdomain.com>\" or \
             \"onboarding@resend.dev\" for initial testing)."
                .into(),
        )
    })?;

    let default_to = std::env::var("SIGNOFF_EMAIL_RECIPIENT").ok();
    let to = body
        .to
        .or(default_to)
        .ok_or_else(|| AppError::BadRequest(
            "No recipient specified — pass `to` in the request body or set \
             SIGNOFF_EMAIL_RECIPIENT on the server."
                .into(),
        ))?;

    // Sanity-check payload
    if body.filename.trim().is_empty() {
        return Err(AppError::BadRequest("filename cannot be empty".into()));
    }
    if body.pdf_base64.is_empty() {
        return Err(AppError::BadRequest("pdf_base64 cannot be empty".into()));
    }

    let subject = body.subject.unwrap_or_else(|| {
        let proj = body.project.as_deref().unwrap_or("Deployment");
        format!("Customer Signoff — {}", proj)
    });

    // Simple HTML body — just enough context that the recipient knows
    // which deal this signoff belongs to. The PDF itself is the record.
    let project = body.project.as_deref().unwrap_or("—");
    let client = body.client.as_deref().unwrap_or("—");
    let site = body.site.as_deref().unwrap_or("—");
    let html_body = format!(
        "<div style=\"font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#111\">\
           <p><strong>Customer signoff completed.</strong> The signed PDF is attached.</p>\
           <table cellpadding=\"4\" style=\"border-collapse:collapse;font-size:13px\">\
             <tr><td style=\"color:#666\">Project</td><td>{}</td></tr>\
             <tr><td style=\"color:#666\">Client</td><td>{}</td></tr>\
             <tr><td style=\"color:#666\">Site</td><td>{}</td></tr>\
           </table>\
           <p style=\"color:#888;font-size:12px\">Sent automatically by the DXD Ops Tracker.</p>\
         </div>",
        html_escape(project),
        html_escape(client),
        html_escape(site),
    );

    // Build Resend payload
    let payload = json!({
        "from": from,
        "to": [to],
        "subject": subject,
        "html": html_body,
        "attachments": [
            {
                "filename": body.filename,
                "content": body.pdf_base64,
            }
        ],
    });

    let res = state
        .http
        .post("https://api.resend.com/emails")
        .bearer_auth(api_key)
        .header("content-type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("Resend request failed: {e}")))?;

    let status = res.status();
    let response_body: Value = res
        .json()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse Resend response: {e}")))?;

    if !status.is_success() {
        let detail = response_body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown Resend error")
            .to_string();
        return Err(AppError::BadRequest(format!(
            "Resend {}: {}",
            status.as_u16(),
            detail
        )));
    }

    Ok(Json(response_body))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
