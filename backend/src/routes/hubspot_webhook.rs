// HubSpot inbound webhooks. Configured in the HubSpot app subscriptions
// UI to POST here on deal.propertyChange / deal.creation / deal.deletion.
//
// Each event tells us which deal changed; we act by kicking a refresh on
// the affected project (updating projects.hs_synced_at as a marker) and by
// re-pulling service_locations → projects.site if that specific property
// changed. Event bodies are also stored in the hubspot_events table so the
// frontend can display a recent-events feed.

use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{error::AppError, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/webhooks/hubspot", post(receive_webhook))
        .route("/hubspot/events", get(list_events))
}

#[derive(Debug, Deserialize)]
struct HubSpotEvent {
    #[serde(default)]
    #[serde(rename = "eventId")]
    event_id: Option<i64>,
    #[serde(default)]
    #[serde(rename = "subscriptionType")]
    subscription_type: Option<String>,
    #[serde(default)]
    #[serde(rename = "portalId")]
    portal_id: Option<i64>,
    #[serde(default)]
    #[serde(rename = "occurredAt")]
    occurred_at: Option<i64>,
    #[serde(default)]
    #[serde(rename = "objectId")]
    object_id: Option<i64>,
    #[serde(default)]
    #[serde(rename = "propertyName")]
    property_name: Option<String>,
    #[serde(default)]
    #[serde(rename = "propertyValue")]
    property_value: Option<String>,
}

// Verify HubSpot's v3 request signature. Optional — if HUBSPOT_APP_SECRET
// isn't configured we skip verification and log a warning so the endpoint
// still works for early setup / self-hosted testing.
fn verify_signature(headers: &HeaderMap, body: &[u8]) -> bool {
    let Ok(secret) = std::env::var("HUBSPOT_APP_SECRET") else {
        eprintln!("hubspot webhook: HUBSPOT_APP_SECRET not set, skipping signature verification");
        return true;
    };
    let Some(sig_header) = headers.get("x-hubspot-signature-v3").and_then(|v| v.to_str().ok()) else {
        return false;
    };
    let ts = headers.get("x-hubspot-request-timestamp").and_then(|v| v.to_str().ok()).unwrap_or("");
    let method = "POST";
    let host = headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("");
    // HubSpot signs "METHOD + full URL + body + timestamp". We reconstruct
    // the URL from Host + path. When behind Azure the scheme is https.
    let url = format!("https://{host}/api/webhooks/hubspot");
    let base = format!("{method}{url}{}{}", String::from_utf8_lossy(body), ts);
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(base.as_bytes());
    let computed = mac.finalize().into_bytes();
    // Base64-encode and compare (constant-time).
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let computed_b64 = STANDARD.encode(computed);
    constant_time_eq::constant_time_eq(computed_b64.as_bytes(), sig_header.as_bytes())
}

async fn receive_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<Value>), AppError> {
    if !verify_signature(&headers, &body) {
        return Err(AppError::BadRequest("Invalid HubSpot signature".into()));
    }

    let events: Vec<HubSpotEvent> = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid webhook body: {e}")))?;

    let mut processed: i64 = 0;
    for ev in events.iter() {
        let Some(deal_id) = ev.object_id else { continue };
        let deal_id_str = deal_id.to_string();

        // Store the event first so nothing gets lost. Dynamic sqlx::query
        // (not the query! macro) so the compile-time DB check doesn't need
        // the hubspot_events table to exist yet — migrations run at App
        // Service startup, AFTER the Rust build. Same reason we can't use
        // the macro for the hs_synced_at update below.
        let event_json = serde_json::to_string(&json!({
            "eventId": ev.event_id,
            "subscriptionType": ev.subscription_type,
            "propertyName": ev.property_name,
            "propertyValue": ev.property_value,
            "portalId": ev.portal_id,
            "occurredAt": ev.occurred_at,
            "objectId": ev.object_id,
        }))
        .unwrap_or_else(|_| "{}".into());
        let now_iso = chrono::Utc::now().to_rfc3339();
        let _ = sqlx::query(
            "INSERT INTO hubspot_events (deal_id, subscription_type, property_name, property_value, occurred_at, received_at, raw)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(&deal_id_str)
        .bind(ev.subscription_type.clone().unwrap_or_default())
        .bind(ev.property_name.clone().unwrap_or_default())
        .bind(ev.property_value.clone().unwrap_or_default())
        .bind(ev.occurred_at.unwrap_or(0))
        .bind(&now_iso)
        .bind(&event_json)
        .execute(&state.pool)
        .await;

        // If we track this deal, sync the site field for
        // service_locations changes.
        if ev.property_name.as_deref() == Some("service_locations") {
            if let Some(v) = &ev.property_value {
                let _ = sqlx::query(
                    "UPDATE projects SET site = $1 WHERE hubspot_deal_id = $2 AND (site IS NULL OR site = '')"
                )
                .bind(v.trim())
                .bind(&deal_id_str)
                .execute(&state.pool)
                .await;
            }
        }
        // Bump projects.hs_synced_at — dynamic query so we don't need the
        // new column to exist at compile time.
        let _ = sqlx::query(
            "UPDATE projects SET hs_synced_at = $1 WHERE hubspot_deal_id = $2"
        )
        .bind(&now_iso)
        .bind(&deal_id_str)
        .execute(&state.pool)
        .await;
        processed += 1;
    }

    Ok((StatusCode::OK, Json(json!({ "processed": processed }))))
}

#[derive(Serialize)]
struct EventRow {
    id: i64,
    deal_id: String,
    subscription_type: String,
    property_name: String,
    property_value: String,
    occurred_at: i64,
    received_at: String,
    project_id: Option<String>,
    project_name: Option<String>,
}

async fn list_events(State(state): State<AppState>) -> Result<Json<Vec<EventRow>>, AppError> {
    use sqlx::Row;
    let rows = sqlx::query(
        r#"SELECT e.id, e.deal_id, e.subscription_type, e.property_name, e.property_value,
                  e.occurred_at, e.received_at, p.id AS project_id, p.name AS project_name
             FROM hubspot_events e
             LEFT JOIN projects p ON p.hubspot_deal_id = e.deal_id
            ORDER BY e.received_at DESC
            LIMIT 100"#
    )
    .fetch_all(&state.pool)
    .await?;

    let out = rows
        .into_iter()
        .map(|r| EventRow {
            id:                r.try_get("id").unwrap_or(0),
            deal_id:           r.try_get("deal_id").unwrap_or_default(),
            subscription_type: r.try_get("subscription_type").unwrap_or_default(),
            property_name:     r.try_get("property_name").unwrap_or_default(),
            property_value:    r.try_get("property_value").unwrap_or_default(),
            occurred_at:       r.try_get("occurred_at").unwrap_or(0),
            received_at:       r.try_get("received_at").unwrap_or_default(),
            project_id:        r.try_get("project_id").ok(),
            project_name:      r.try_get("project_name").ok(),
        })
        .collect();
    Ok(Json(out))
}
