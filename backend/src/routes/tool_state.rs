use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};

use crate::{error::AppError, models::*, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/tool-state/:key", get(get_state).put(put_state))
}

async fn get_state(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Json<ToolStateResponse>, AppError> {
    if key.trim().is_empty() {
        return Err(AppError::BadRequest("tool key is required".into()));
    }
    let row = sqlx::query!(
        "SELECT state, updated_at FROM tool_state WHERE tool_key = $1",
        key
    )
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&r.state).unwrap_or(serde_json::json!({}));
            Ok(Json(ToolStateResponse {
                tool_key: key,
                state: parsed,
                updated_at: r.updated_at,
            }))
        }
        None => Ok(Json(ToolStateResponse {
            tool_key: key,
            state: serde_json::json!({}),
            updated_at: String::new(),
        })),
    }
}

async fn put_state(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Json(body): Json<UpdateToolState>,
) -> Result<StatusCode, AppError> {
    if key.trim().is_empty() {
        return Err(AppError::BadRequest("tool key is required".into()));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let s = serde_json::to_string(&body.state).map_err(|e| AppError::BadRequest(e.to_string()))?;
    sqlx::query!(
        "INSERT INTO tool_state (tool_key, state, updated_at) VALUES ($1, $2, $3) \
         ON CONFLICT (tool_key) DO UPDATE SET state = $2, updated_at = $3",
        key, s, now
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
