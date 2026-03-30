use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{error::AppError, models::AttachmentMeta, routes::misc::AppState};

const MAX_SIZE: usize = 10 * 1024 * 1024; // 10 MB

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks/:task_id/attachments", post(upload))
        .route("/attachments/:id", get(download).delete(remove))
}

async fn upload(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<AttachmentMeta>), AppError> {
    let project_id = sqlx::query_scalar!("SELECT project_id FROM tasks WHERE id = ?", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field
            .file_name()
            .unwrap_or("upload")
            .to_string();
        let mime = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let bytes = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        if bytes.len() > MAX_SIZE {
            return Err(AppError::PayloadTooLarge);
        }

        let id = format!("att-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
        let size = bytes.len() as i64;
        let added_at = chrono::Utc::now().to_rfc3339();
        let data = bytes.to_vec();

        sqlx::query!(
            "INSERT INTO attachments (id, task_id, project_id, name, mime_type, size_bytes, data, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            id, task_id, project_id, filename, mime, size, data, added_at
        )
        .execute(&state.pool)
        .await?;

        return Ok((StatusCode::CREATED, Json(AttachmentMeta {
            id,
            task_id,
            name: filename,
            mime_type: mime,
            size_bytes: size,
            added_at,
            added_by: String::new(),
        })));
    }

    Err(AppError::BadRequest("No file field in multipart body".into()))
}

async fn download(
    State(state): State<AppState>,
    Path(att_id): Path<String>,
) -> Result<Response, AppError> {
    let row = sqlx::query!(
        "SELECT name, mime_type, data FROM attachments WHERE id = ?",
        att_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let disposition = format!("attachment; filename=\"{}\"", row.name.replace('"', "\\\""));

    let response = Response::builder()
        .header(header::CONTENT_TYPE, row.mime_type)
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(row.data))
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

async fn remove(
    State(state): State<AppState>,
    Path(att_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query!("DELETE FROM attachments WHERE id = ?", att_id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
