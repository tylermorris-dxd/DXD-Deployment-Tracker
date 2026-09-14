// Project-scoped attachments (parallel to routes::attachments which is
// task-scoped). Two consumers:
//   1. Customer Signoff PDF — generated in the browser, persisted on the deal.
//   2. Install photos — kind = "photo-<category>", shown in the Photos tab.
//
// Endpoints:
//   POST   /projects/:project_id/attachments   upload (multipart)
//   GET    /projects/:project_id/attachments   list metadata (JSON)
//   GET    /project-attachments/:id            download/serve bytes
//   PATCH  /project-attachments/:id            edit caption
//   DELETE /project-attachments/:id            remove
//
// Anything touching the `caption` column uses dynamic sqlx::query() rather
// than the query! macro: migrations run at startup, not at build time, so
// the compile-time schema check would fail against a DB that hasn't taken
// migration 019 yet.

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{error::AppError, routes::misc::AppState};

const MAX_SIZE: usize = 20 * 1024 * 1024; // 20 MB — signed PDFs with sig images can push past 10

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/:project_id/attachments", post(upload).get(list))
        .route(
            "/project-attachments/:id",
            get(download).patch(update_caption).delete(remove),
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
    pub caption: Option<String>,
}

// Raster image types we serve with `inline` so an <img> tag renders them
// directly. SVG is deliberately excluded — a same-origin SVG can execute
// script, so it stays an attachment download.
fn is_inline_safe_image(mime: &str) -> bool {
    matches!(
        mime,
        "image/jpeg" | "image/jpg" | "image/png" | "image/webp"
            | "image/gif" | "image/heic" | "image/heif" | "image/avif"
    )
}

async fn upload(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ProjectAttachmentMeta>), AppError> {
    // Verify the project exists — otherwise a rogue upload could pin
    // orphan rows in the table.
    let exists = sqlx::query_scalar!("SELECT id FROM projects WHERE id = $1", project_id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let mut kind = "other".to_string();
    let mut caption: Option<String> = None;
    let mut file: Option<(String, String, Vec<u8>)> = None;

    // Drain every field before inserting — `kind` and `caption` are not
    // guaranteed to arrive before `file` in the multipart stream.
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        // Own the field name before touching the body — text()/bytes()
        // consume `field`, so the borrow from name() has to end first.
        let field_name = field.name().unwrap_or("").to_string();
        match field_name.as_str() {
            "kind" => {
                kind = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
            }
            "caption" => {
                let t = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                let t = t.trim().to_string();
                if !t.is_empty() {
                    caption = Some(t);
                }
            }
            "file" => {
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
                file = Some((filename, mime, bytes.to_vec()));
            }
            _ => {}
        }
    }

    let (filename, mime, data) =
        file.ok_or_else(|| AppError::BadRequest("No file field in multipart body".into()))?;

    let id = format!("patt-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let size = data.len() as i64;
    let added_at = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO project_attachments \
         (id, project_id, name, mime_type, size_bytes, data, kind, added_at, caption) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(&filename)
    .bind(&mime)
    .bind(size)
    .bind(&data)
    .bind(&kind)
    .bind(&added_at)
    .bind(caption.clone())
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ProjectAttachmentMeta {
            id,
            project_id,
            name: filename,
            mime_type: mime,
            size_bytes: size,
            kind,
            added_at,
            caption,
        }),
    ))
}

async fn list(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<ProjectAttachmentMeta>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, project_id, name, mime_type, size_bytes, kind, added_at, caption \
         FROM project_attachments WHERE project_id = $1 \
         ORDER BY added_at DESC",
    )
    .bind(&project_id)
    .fetch_all(&state.pool)
    .await?;

    let out = rows
        .iter()
        .map(|r| ProjectAttachmentMeta {
            id: r.get("id"),
            project_id: r.get("project_id"),
            name: r.get("name"),
            mime_type: r.get("mime_type"),
            size_bytes: r.get("size_bytes"),
            kind: r.get("kind"),
            added_at: r.get("added_at"),
            caption: r.try_get("caption").unwrap_or(None),
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

    // Photos need to render in an <img>, so images are served inline.
    // Everything else (signoff PDFs) keeps the download disposition.
    let disposition = if is_inline_safe_image(&row.mime_type) {
        "inline".to_string()
    } else {
        format!("attachment; filename=\"{}\"", row.name.replace('"', "\\\""))
    };

    let response = Response::builder()
        .header(header::CONTENT_TYPE, row.mime_type)
        .header(header::CONTENT_DISPOSITION, disposition)
        .header(header::CACHE_CONTROL, "private, max-age=86400")
        .body(Body::from(row.data))
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(response)
}

#[derive(Deserialize)]
pub struct CaptionUpdate {
    pub caption: Option<String>,
}

async fn update_caption(
    State(state): State<AppState>,
    Path(att_id): Path<String>,
    Json(body): Json<CaptionUpdate>,
) -> Result<StatusCode, AppError> {
    let caption = body
        .caption
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty());

    let res = sqlx::query("UPDATE project_attachments SET caption = $1 WHERE id = $2")
        .bind(caption)
        .bind(&att_id)
        .execute(&state.pool)
        .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn remove(
    State(state): State<AppState>,
    Path(att_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query!("DELETE FROM project_attachments WHERE id = $1", att_id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
