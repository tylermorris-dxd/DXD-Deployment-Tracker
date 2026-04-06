use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch, post},
    Json, Router,
};
use sqlx::Row;
use uuid::Uuid;

use crate::{error::AppError, models::*, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/:project_id/equipment",
            get(list_equipment).post(create_equipment),
        )
        .route(
            "/equipment/:id",
            patch(update_equipment).delete(delete_equipment),
        )
}

async fn list_equipment(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<EquipmentItem>>, AppError> {
    // 1. Fetch stored rows
    let stored = sqlx::query(
        "SELECT id, project_id, subtask_id, name, serial_number, status, \
         operator, qty, notes, created_at \
         FROM equipment WHERE project_id = $1 ORDER BY created_at",
    )
    .bind(&project_id)
    .fetch_all(&state.pool)
    .await?;

    let stored_subtask_ids: std::collections::HashSet<i64> = stored
        .iter()
        .filter_map(|r| {
            let v: Option<i64> = r.try_get("subtask_id").ok()?;
            v
        })
        .collect();

    let mut items: Vec<EquipmentItem> = Vec::with_capacity(stored.len());
    for r in &stored {
        items.push(EquipmentItem {
            id: r.try_get("id")?,
            project_id: r.try_get("project_id")?,
            subtask_id: r.try_get("subtask_id")?,
            name: r.try_get("name")?,
            serial_number: r.try_get("serial_number")?,
            status: r.try_get("status")?,
            operator: r.try_get("operator")?,
            qty: r.try_get("qty")?,
            notes: r.try_get("notes")?,
            created_at: r.try_get("created_at")?,
            is_virtual: false,
        });
    }

    // 2. Auto-populate virtual entries from Phase 2 trackDates subtasks
    let virtuals = sqlx::query(
        "SELECT s.id, s.text, s.ot_ordered, s.ot_shipped, s.ot_delivered \
         FROM subtasks s \
         JOIN tasks t   ON t.id  = s.task_id \
         JOIN phases ph ON ph.id = t.phase_id \
         WHERE s.project_id = $1 \
           AND t.track_dates = TRUE \
           AND ph.phase_number = 2 \
           AND (s.is_done = TRUE OR s.ot_ordered <> '')",
    )
    .bind(&project_id)
    .fetch_all(&state.pool)
    .await?;

    for v in &virtuals {
        let subtask_id: i64 = v.try_get("id")?;
        if stored_subtask_ids.contains(&subtask_id) {
            continue;
        }
        let ot_ordered: String = v.try_get("ot_ordered")?;
        let ot_shipped: String = v.try_get("ot_shipped")?;
        let ot_delivered: String = v.try_get("ot_delivered")?;
        let status = if !ot_delivered.is_empty() {
            "delivered"
        } else if !ot_shipped.is_empty() {
            "shipped"
        } else if !ot_ordered.is_empty() {
            "ordered"
        } else {
            "pending"
        };
        items.push(EquipmentItem {
            id: format!("virt-{}", subtask_id),
            project_id: project_id.clone(),
            subtask_id: Some(subtask_id),
            name: v.try_get("text")?,
            serial_number: String::new(),
            status: status.to_string(),
            operator: String::new(),
            qty: 1,
            notes: String::new(),
            created_at: String::new(),
            is_virtual: true,
        });
    }

    Ok(Json(items))
}

async fn create_equipment(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateEquipment>,
) -> Result<(StatusCode, Json<EquipmentItem>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    let id = format!("equip-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let serial_number = body.serial_number.unwrap_or_default();
    let status = body.status.unwrap_or_else(|| "ordered".into());
    let operator = body.operator.unwrap_or_default();
    let qty: i32 = body.qty.unwrap_or(1).max(1);
    let notes = body.notes.unwrap_or_default();
    let created_at = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO equipment \
         (id, project_id, subtask_id, name, serial_number, status, operator, qty, notes, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(body.subtask_id)
    .bind(&body.name)
    .bind(&serial_number)
    .bind(&status)
    .bind(&operator)
    .bind(qty)
    .bind(&notes)
    .bind(&created_at)
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(EquipmentItem {
            id,
            project_id,
            subtask_id: body.subtask_id,
            name: body.name,
            serial_number,
            status,
            operator,
            qty,
            notes,
            created_at,
            is_virtual: false,
        }),
    ))
}

async fn update_equipment(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateEquipment>,
) -> Result<StatusCode, AppError> {
    if let Some(v) = &body.name {
        if v.trim().is_empty() {
            return Err(AppError::BadRequest("name cannot be empty".into()));
        }
        sqlx::query("UPDATE equipment SET name = $1 WHERE id = $2")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.serial_number {
        sqlx::query("UPDATE equipment SET serial_number = $1 WHERE id = $2")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.status {
        sqlx::query("UPDATE equipment SET status = $1 WHERE id = $2")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.operator {
        sqlx::query("UPDATE equipment SET operator = $1 WHERE id = $2")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.qty {
        let qty: i32 = v.max(1);
        sqlx::query("UPDATE equipment SET qty = $1 WHERE id = $2")
            .bind(qty)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.notes {
        sqlx::query("UPDATE equipment SET notes = $1 WHERE id = $2")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_equipment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM equipment WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
