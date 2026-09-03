// Live customer signoff link. The operator creates a session for a deal,
// gets back a token + a public URL. The customer opens that URL on any
// device, signs on-screen, and the strokes get POSTed back as they happen.
// The operator polls a status endpoint every ~2s and re-renders the
// customer's signature stroke-by-stroke in the deal panel. When the
// customer taps "Complete," the session is marked accepted and the file
// path integrates with the existing PDF/email/HubSpot signoff flow later.

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{error::AppError, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/:project_id/signoff-sessions", post(create_session))
        .route("/projects/:project_id/signoff-sessions/:token/status", get(session_status))
        // Public — no auth. Kept under /public/... so the auth middleware
        // (whatever is added later) knows to skip these two.
        .route("/public/signoff/:token/info",      get(customer_info))
        .route("/public/signoff/:token/strokes",   post(post_strokes))
        .route("/public/signoff/:token/complete",  post(complete_session))
}

#[derive(Deserialize)]
struct CreateReq {
    #[serde(default)] project_name: Option<String>,
    #[serde(default)] client_name:  Option<String>,
    #[serde(default)] site:         Option<String>,
}

#[derive(Serialize)]
struct CreateResp {
    token: String,
    url:   String,
}

async fn create_session(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateReq>,
) -> Result<Json<CreateResp>, AppError> {
    let token = Uuid::new_v4().to_string().replace('-', "");
    let now_iso = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO signoff_sessions (token, project_id, project_name, client_name, site, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&token)
    .bind(&project_id)
    .bind(body.project_name.unwrap_or_default())
    .bind(body.client_name.unwrap_or_default())
    .bind(body.site.unwrap_or_default())
    .bind(&now_iso)
    .execute(&state.pool)
    .await?;
    // Relative URL that works with the static-exported frontend. The
    // customer-facing page lives at /live-signoff.html and reads the
    // token from the query string.
    let url = format!("/live-signoff.html?token={}", token);
    Ok(Json(CreateResp { token, url }))
}

#[derive(Serialize)]
struct CustomerInfo {
    project_name:  String,
    client_name:   String,
    site:          String,
    completed_at:  Option<String>,
    accepted:      bool,
}

async fn customer_info(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<CustomerInfo>, AppError> {
    use sqlx::Row;
    let row = sqlx::query(
        "SELECT project_name, client_name, site, completed_at, accepted
           FROM signoff_sessions WHERE token = $1"
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(CustomerInfo {
        project_name: row.try_get("project_name").unwrap_or_default(),
        client_name:  row.try_get("client_name").unwrap_or_default(),
        site:         row.try_get("site").unwrap_or_default(),
        completed_at: row.try_get("completed_at").ok(),
        accepted:     row.try_get("accepted").unwrap_or(false),
    }))
}

#[derive(Deserialize)]
struct StrokesReq {
    // The full stroke array to date. Simpler than delta updates and small
    // enough (a full signature is a few KB) that overwriting each time is
    // fine.
    strokes: Value,
    #[serde(default)] customer_name:  Option<String>,
    #[serde(default)] customer_email: Option<String>,
}

async fn post_strokes(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(body): Json<StrokesReq>,
) -> Result<Json<Value>, AppError> {
    let strokes_json = serde_json::to_string(&body.strokes)
        .map_err(|e| AppError::BadRequest(format!("Invalid strokes: {e}")))?;
    let res = sqlx::query(
        "UPDATE signoff_sessions
            SET strokes = $1,
                customer_name  = COALESCE($2, customer_name),
                customer_email = COALESCE($3, customer_email)
          WHERE token = $4 AND (accepted = FALSE)"
    )
    .bind(&strokes_json)
    .bind(&body.customer_name)
    .bind(&body.customer_email)
    .bind(&token)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 { return Err(AppError::NotFound) }
    Ok(Json(json!({ "ok": true })))
}

async fn complete_session(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<Value>, AppError> {
    let now_iso = chrono::Utc::now().to_rfc3339();
    let res = sqlx::query(
        "UPDATE signoff_sessions
            SET accepted = TRUE, completed_at = $1
          WHERE token = $2"
    )
    .bind(&now_iso)
    .bind(&token)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 { return Err(AppError::NotFound) }
    Ok(Json(json!({ "ok": true, "completedAt": now_iso })))
}

#[derive(Serialize)]
struct SessionStatus {
    token:          String,
    created_at:     String,
    completed_at:   Option<String>,
    accepted:       bool,
    customer_name:  Option<String>,
    customer_email: Option<String>,
    strokes:        Value,
}

async fn session_status(
    State(state): State<AppState>,
    Path((project_id, token)): Path<(String, String)>,
) -> Result<Json<SessionStatus>, AppError> {
    use sqlx::Row;
    let row = sqlx::query(
        "SELECT token, created_at, completed_at, accepted, customer_name, customer_email, strokes
           FROM signoff_sessions WHERE token = $1 AND project_id = $2"
    )
    .bind(&token)
    .bind(&project_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    let strokes_s: String = row.try_get("strokes").unwrap_or_else(|_| "[]".into());
    let strokes: Value = serde_json::from_str(&strokes_s).unwrap_or(json!([]));
    Ok(Json(SessionStatus {
        token:          row.try_get("token").unwrap_or_default(),
        created_at:     row.try_get("created_at").unwrap_or_default(),
        completed_at:   row.try_get("completed_at").ok(),
        accepted:       row.try_get("accepted").unwrap_or(false),
        customer_name:  row.try_get("customer_name").ok(),
        customer_email: row.try_get("customer_email").ok(),
        strokes,
    }))
}
