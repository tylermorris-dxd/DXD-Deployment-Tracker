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
    // Optional — when the project has a HubSpot deal id, the frontend
    // passes it through so the PDF gets attached to the deal's record.
    #[serde(default)]
    hubspot_deal_id: Option<String>,
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

    // Best-effort HubSpot attachment. Fires only when the caller provided
    // hubspot_deal_id AND the tool has a HubSpot token stored. Failures are
    // recorded on the response but don't fail the whole request — the
    // email + local save already succeeded.
    let mut hubspot_status: Value = json!({ "skipped": "no hubspot_deal_id" });
    if let Some(deal_id) = body.hubspot_deal_id.as_deref() {
        hubspot_status = attempt_hubspot_attach(&state, deal_id, &body.filename, &body.pdf_base64, project, client, site).await;
    }

    Ok(Json(json!({
        "resend": response_body,
        "hubspot": hubspot_status,
    })))
}

async fn attempt_hubspot_attach(
    state: &AppState,
    deal_id: &str,
    filename: &str,
    pdf_base64: &str,
    project: &str,
    client: &str,
    site: &str,
) -> Value {
    // Load HubSpot token — settings row 'hubspot_token'. Skip if not set.
    let token = match sqlx::query_scalar!("SELECT value FROM settings WHERE key = 'hubspot_token'")
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
    {
        Some(t) => t,
        None => return json!({ "skipped": "HubSpot not connected on this workspace" }),
    };

    // Decode the base64 PDF back to raw bytes for the multipart upload.
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let pdf_bytes = match STANDARD.decode(pdf_base64) {
        Ok(b) => b,
        Err(e) => return json!({ "error": format!("base64 decode failed: {e}") }),
    };

    // 1. Upload the file to HubSpot Files.
    let options = json!({
        "access": "PRIVATE",
        "overwrite": false,
        "duplicateValidationStrategy": "NONE",
        "duplicateValidationScope": "ENTIRE_PORTAL"
    })
    .to_string();
    let part = match reqwest::multipart::Part::bytes(pdf_bytes)
        .file_name(filename.to_string())
        .mime_str("application/pdf") {
        Ok(p) => p,
        Err(e) => return json!({ "error": format!("multipart part failed: {e}") }),
    };
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("folderPath", "/DXD Signoffs")
        .text("options", options);

    let upload_res = state
        .http
        .post("https://api.hubapi.com/files/v3/files")
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .await;
    let upload_json: Value = match upload_res {
        Ok(r) => {
            if !r.status().is_success() {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                return json!({ "error": format!("HubSpot Files {}: {}", status.as_u16(), body) });
            }
            match r.json::<Value>().await {
                Ok(j) => j,
                Err(e) => return json!({ "error": format!("HubSpot Files JSON: {e}") }),
            }
        }
        Err(e) => return json!({ "error": format!("HubSpot Files request failed: {e}") }),
    };
    let file_id = match upload_json.get("id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({ "error": "HubSpot Files: response missing id", "raw": upload_json }),
    };

    // 2. Create a note referencing the file and associate it with the deal.
    //    associationTypeId 214 = note_to_deal (HubSpot-defined).
    let now_ms = chrono::Utc::now().timestamp_millis();
    let note_body = format!(
        "<p><strong>Customer signoff PDF attached from DXD Ops Tracker.</strong></p>\
         <ul>\
           <li><b>Project:</b> {}</li>\
           <li><b>Client:</b> {}</li>\
           <li><b>Site:</b> {}</li>\
         </ul>",
        html_escape(project), html_escape(client), html_escape(site)
    );
    let note_payload = json!({
        "properties": {
            "hs_note_body": note_body,
            "hs_timestamp": now_ms,
            "hs_attachment_ids": file_id,
        },
        "associations": [{
            "to": { "id": deal_id },
            "types": [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 214 }]
        }]
    });

    let note_res = state
        .http
        .post("https://api.hubapi.com/crm/v3/objects/notes")
        .bearer_auth(&token)
        .header("content-type", "application/json")
        .json(&note_payload)
        .send()
        .await;
    match note_res {
        Ok(r) => {
            if !r.status().is_success() {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                return json!({
                    "fileId": file_id,
                    "error": format!("HubSpot Note {}: {}", status.as_u16(), body)
                });
            }
            match r.json::<Value>().await {
                Ok(note) => json!({ "fileId": file_id, "note": note }),
                Err(_) => json!({ "fileId": file_id, "note": null }),
            }
        }
        Err(e) => json!({ "fileId": file_id, "error": format!("HubSpot Note request failed: {e}") }),
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
