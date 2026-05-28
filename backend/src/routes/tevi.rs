use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};

use crate::{error::AppError, models::*, routes::misc::AppState};

// Shared team-wide TEVI evaluation state. Single row keyed by id=1
// (CHECK constraint in migration 013 enforces that). The whole
// frontend reducer state lives in the `state` column as JSON text.

pub fn router() -> Router<AppState> {
    Router::new().route("/drone-tevi-state", get(get_state).put(put_state))
}

async fn get_state(State(state): State<AppState>) -> Result<Json<TeviStateResponse>, AppError> {
    let row = sqlx::query!(
        "SELECT state, updated_at FROM drone_tevi_state WHERE id = 1"
    )
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&r.state).unwrap_or(serde_json::json!({}));
            Ok(Json(TeviStateResponse {
                state: parsed,
                updated_at: r.updated_at,
            }))
        }
        // Migration 013 seeded a row, but be defensive in case it was
        // ever deleted or never seeded against this database.
        None => Ok(Json(TeviStateResponse {
            state: serde_json::json!({}),
            updated_at: String::new(),
        })),
    }
}

async fn put_state(
    State(state): State<AppState>,
    Json(body): Json<UpdateTeviState>,
) -> Result<StatusCode, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let s = serde_json::to_string(&body.state)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    // Upsert on the singleton id=1 row. EXCLUDED.col is the canonical
    // Postgres idiom for "use the value we just tried to INSERT" — each
    // bound parameter is referenced exactly once, which keeps sqlx's
    // parameter-counting unambiguous.
    sqlx::query!(
        "INSERT INTO drone_tevi_state (id, state, updated_at) VALUES (1, $1, $2) \
         ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at",
        s, now
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
