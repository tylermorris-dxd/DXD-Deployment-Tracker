use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};

use crate::{error::AppError, models::*, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/drone-tevi-state", get(get_state).put(put_state))
}

async fn get_state(State(state): State<AppState>) -> Result<Json<TeviStateResponse>, AppError> {
    let row = sqlx::query!("SELECT state, updated_at FROM drone_tevi_state WHERE id = 1")
        .fetch_optional(&state.pool)
        .await?;

    match row {
        Some(r) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&r.state).unwrap_or(serde_json::json!({}));
            Ok(Json(TeviStateResponse { state: parsed, updated_at: r.updated_at }))
        }
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
    let s = serde_json::to_string(&body.state).map_err(|e| AppError::BadRequest(e.to_string()))?;
    sqlx::query!(
        "INSERT INTO drone_tevi_state (id, state, updated_at) VALUES (1, $1, $2) \
         ON CONFLICT (id) DO UPDATE SET state = $1, updated_at = $2",
        s, now
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
