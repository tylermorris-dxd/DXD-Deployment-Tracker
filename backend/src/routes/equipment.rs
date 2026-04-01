use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch, post},
    Json, Router,
};
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
    let stored = sqlx::query!(
        r#"SELECT id, project_id, subtask_id, name, serial_number, status,
                  operator, qty, notes, created_at
           FROM equipment WHERE project_id = $1 ORDER BY created_at"#,
        project_id
    )
    .fetch_all(&state.pool)
    .await?;

    let stored_subtask_ids: std::collections::HashSet<i64> = stored
        .iter()
        .filter_map(|r| r.subtask_id)
        .collect();

    let mut items: Vec<EquipmentItem> = stored
        .into_iter()
        .map(|r| EquipmentItem {
            id: r.id,
            project_id: r.project_id,
            subtask_id: r.subtask_id,
            name: r.name,
            serial_number: r.serial_number,
            status: r.status,
            operator: r.operator,
            qty: r.qty,
            notes: r.notes,
            created_at: r.created_at,
            is_virtual: false,
        })
        .collect();

    // 2. Auto-populate virtual entries from Phase 2 trackDates subtasks
    let virtuals = sqlx::query!(
        r#"SELECT s.id, s.text, s.ot_ordered, s.ot_shipped, s.ot_delivered
           FROM subtasks s
           JOIN tasks t   ON t.id  = s.task_id
           JOIN phases ph ON ph.id = t.phase_id
           WHERE s.project_id = $1
             AND t.track_dates = TRUE
             AND ph.phase_number = 2
             AND (s.is_done = TRUE OR s.ot_ordered <> '')"#,
        project_id
    )
    .fetch_all(&state.pool)
    .await?;

    for v in virtuals {
        if stored_subtask_ids.contains(&v.id) {
            continue;
        }
        let status = if !v.ot_delivered.is_empty() {
            "delivered"
        } else if !v.ot_shipped.is_empty() {
            "shipped"
        } else if !v.ot_ordered.is_empty() {
            "ordered"
        } else {
            "pending"
        };
        items.push(EquipmentItem {
            id: format!("virt-{}", v.id),
            project_id: project_id.clone(),
            subtask_id: Some(v.id),
            name: v.text,
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
    let qty = body.qty.unwrap_or(1).max(1);
    let notes = body.notes.unwrap_or_default();
    let created_at = chrono::Utc::now().to_rfc3339();

    sqlx::query!(
        r#"INSERT INTO equipment
             (id, project_id, subtask_id, name, serial_number, status, operator, qty, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"#,
        id,
        project_id,
        body.subtask_id,
        body.name,
        serial_number,
        status,
        operator,
        qty,
        notes,
        created_at
    )
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
        sqlx::query!("UPDATE equipment SET name = $1 WHERE id = $2", v, id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.serial_number {
        sqlx::query!("UPDATE equipment SET serial_number = $1 WHERE id = $2", v, id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.status {
        sqlx::query!("UPDATE equipment SET status = $1 WHERE id = $2", v, id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.operator {
        sqlx::query!("UPDATE equipment SET operator = $1 WHERE id = $2", v, id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.qty {
        let qty = v.max(1);
        sqlx::query!("UPDATE equipment SET qty = $1 WHERE id = $2", qty, id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.notes {
        sqlx::query!("UPDATE equipment SET notes = $1 WHERE id = $2", v, id)
            .execute(&state.pool)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_equipment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query!("DELETE FROM equipment WHERE id = $1", id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
