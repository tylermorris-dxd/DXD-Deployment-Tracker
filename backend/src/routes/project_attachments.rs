// Project-scoped attachments (parallel to routes::attachments which is
// task-scoped). First consumer is the Customer Signoff PDF: the tool
// generates a signed PDF in the browser and needs to persist it on the
// deal itself so it can be re-downloaded later.
//
// Endpoints:
//   POST   /projects/:project_id/attachments   upload (multipart)
//   GET    /projects/:project_id/attachments   list metadata (JSON)
//   GET    /project-attachments/:id            download bytes
//   DELETE /project-attachments/:id            remove

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{error::AppError, routes::misc::AppState};

const MAX_SIZE: usize = 20 * 1024 * 1024; // 20 MB — signed PDFs with sig images can push past 10

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/:project_id/attachments", post(upload).get(list))
        .route(
            "/project-attachments/:id",
            get(download).delete(remove),
        )
}

#[derive(Serialize)]
pub struct ProjectAttachmentMeta {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub kind: String,
    pub added_at: String,
}

async fn upload(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ProjectAttachmentMeta>), AppError> {
    // Verify the project exists — otherwise a rogue upload could pin
    // orphan rows in the table.
    let exists = sqlx::query_scalar!(
        "SELECT id FROM projects WHERE id = $1",
        project_id
    )
    .fetch_optional(&state.pool)
    .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let mut kind = "other".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();

        // We accept an optional `kind` text field so the caller can tag
        // uploads (e.g. "signoff") without needing a separate endpoint.
        if name == "kind" {
            kind = field
                .text()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            continue;
        }

        if name != "file" {
            continue;
        }

        let filename = field.file_name().unwrap_or("upload").to_string();
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

        let id = format!("patt-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
        let size = bytes.len() as i64;
        let added_at = chrono::Utc::now().to_rfc3339();
        let data = bytes.to_vec();

        sqlx::query!(
            "INSERT INTO project_attachments (id, project_id, name, mime_type, size_bytes, data, kind, added_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            id,
            project_id,
            filename,
            mime,
            size,
            data,
            kind,
            added_at
        )
        .execute(&state.pool)
        .await?;

        return Ok((
            StatusCode::CREATED,
            Json(ProjectAttachmentMeta {
                id,
                project_id,
                name: filename,
                mime_type: mime,
                size_bytes: size,
                kind,
                added_at,
            }),
        ));
    }

    Err(AppError::BadRequest("No file field in multipart body".into()))
}

async fn list(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<ProjectAttachmentMeta>>, AppError> {
    let rows = sqlx::query!(
        "SELECT id, project_id, name, mime_type, size_bytes, kind, added_at \
         FROM project_attachments WHERE project_id = $1 \
         ORDER BY added_at DESC",
        project_id
    )
    .fetch_all(&state.pool)
    .await?;

    let out = rows
        .into_iter()
        .map(|r| ProjectAttachmentMeta {
            id: r.id,
            project_id: r.project_id,
            name: r.name,
            mime_type: r.mime_type,
            size_bytes: r.size_bytes,
            kind: r.kind,
            added_at: r.added_at,
        })
        .collect();

    Ok(Json(out))
}

async fn download(
    State(state): State<AppState>,
    Path(att_id): Path<String>,
) -> Result<Response, AppError> {
    let row = sqlx::query!(
        "SELECT name, mime_type, data FROM project_attachments WHERE id = $1",
        att_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let disposition = format!(
        "attachment; filename=\"{}\"",
        row.name.replace('"', "\\\"")
    );

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
    let res = sqlx::query!(
        "DELETE FROM project_attachments WHERE id = $1",
        att_id
    )
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
