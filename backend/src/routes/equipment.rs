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
        .route(
            "/equipment-sections",
            get(list_sections).post(create_section),
        )
        .route(
            "/equipment-sections/:id",
            patch(update_section).delete(delete_section),
        )
        .route(
            "/equipment-sections/:id/equipment",
            get(list_section_equipment).post(create_section_equipment),
        )
}

async fn list_equipment(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<EquipmentItem>>, AppError> {
    let stored = sqlx::query(
        "SELECT id, project_id, subtask_id, name, serial_number, faa_reg_number, \
         status, operator, qty, notes, date_ordered, date_received, group_name, created_at \
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
            project_id: Some(r.try_get("project_id")?),
            section_id: None,
            subtask_id: r.try_get("subtask_id")?,
            name: r.try_get("name")?,
            serial_number: r.try_get("serial_number")?,
            faa_reg_number: r.try_get("faa_reg_number")?,
            status: r.try_get("status")?,
            operator: r.try_get("operator")?,
            qty: r.try_get("qty")?,
            notes: r.try_get("notes")?,
            date_ordered: r.try_get("date_ordered")?,
            date_received: r.try_get("date_received")?,
            group_name: r.try_get("group_name")?,
            created_at: r.try_get("created_at")?,
            is_virtual: false,
        });
    }

    // Auto-populate virtual entries from Phase 2 trackDates subtasks
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
            project_id: Some(project_id.clone()),
            section_id: None,
            subtask_id: Some(subtask_id),
            name: v.try_get("text")?,
            serial_number: String::new(),
            faa_reg_number: String::new(),
            status: status.to_string(),
            operator: String::new(),
            qty: 1,
            notes: String::new(),
            date_ordered: ot_ordered,
            date_received: ot_delivered,
            group_name: String::new(),
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
    let serial_number  = body.serial_number.unwrap_or_default();
    let faa_reg_number = body.faa_reg_number.unwrap_or_default();
    let status         = body.status.unwrap_or_else(|| "ordered".into());
    let operator       = body.operator.unwrap_or_default();
    let qty: i32       = body.qty.unwrap_or(1).max(1);
    let notes          = body.notes.unwrap_or_default();
    let date_ordered   = body.date_ordered.unwrap_or_default();
    let date_received  = body.date_received.unwrap_or_default();
    let group_name     = body.group_name.unwrap_or_default();
    let created_at     = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO equipment \
         (id, project_id, subtask_id, name, serial_number, faa_reg_number, status, operator, \
          qty, notes, date_ordered, date_received, group_name, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(body.subtask_id)
    .bind(&body.name)
    .bind(&serial_number)
    .bind(&faa_reg_number)
    .bind(&status)
    .bind(&operator)
    .bind(qty)
    .bind(&notes)
    .bind(&date_ordered)
    .bind(&date_received)
    .bind(&group_name)
    .bind(&created_at)
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(EquipmentItem {
            id,
            project_id: Some(project_id),
            section_id: None,
            subtask_id: body.subtask_id,
            name: body.name,
            serial_number,
            faa_reg_number,
            status,
            operator,
            qty,
            notes,
            date_ordered,
            date_received,
            group_name,
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
    macro_rules! patch {
        ($field:literal, $val:expr) => {
            sqlx::query(concat!("UPDATE equipment SET ", $field, " = $1 WHERE id = $2"))
                .bind($val)
                .bind(&id)
                .execute(&state.pool)
                .await?;
        };
    }
    if let Some(v) = &body.name {
        if v.trim().is_empty() {
            return Err(AppError::BadRequest("name cannot be empty".into()));
        }
        patch!("name", v);
    }
    if let Some(v) = &body.serial_number  { patch!("serial_number",  v); }
    if let Some(v) = &body.faa_reg_number { patch!("faa_reg_number", v); }
    if let Some(v) = &body.status         { patch!("status",         v); }
    if let Some(v) = &body.operator       { patch!("operator",       v); }
    if let Some(v) = body.qty             { patch!("qty",            v.max(1)); }
    if let Some(v) = &body.notes          { patch!("notes",          v); }
    if let Some(v) = &body.date_ordered   { patch!("date_ordered",   v); }
    if let Some(v) = &body.date_received  { patch!("date_received",  v); }
    if let Some(v) = &body.group_name     { patch!("group_name",     v); }
    if let Some(pid) = &body.reassign_project_id {
        sqlx::query("UPDATE equipment SET project_id = $1, section_id = NULL WHERE id = $2")
            .bind(pid).bind(&id).execute(&state.pool).await?;
    }
    if let Some(sid) = &body.reassign_section_id {
        sqlx::query("UPDATE equipment SET section_id = $1, project_id = NULL WHERE id = $2")
            .bind(sid).bind(&id).execute(&state.pool).await?;
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

// ── Section CRUD ──────────────────────────────────────────────────────────────

async fn list_sections(
    State(state): State<AppState>,
) -> Result<Json<Vec<EquipmentSection>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, name, created_at FROM equipment_sections ORDER BY created_at",
    )
    .fetch_all(&state.pool)
    .await?;
    let sections = rows
        .iter()
        .map(|r| {
            Ok(EquipmentSection {
                id: r.try_get("id")?,
                name: r.try_get("name")?,
                created_at: r.try_get("created_at")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    Ok(Json(sections))
}

async fn create_section(
    State(state): State<AppState>,
    Json(body): Json<CreateEquipmentSection>,
) -> Result<(StatusCode, Json<EquipmentSection>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    let id = format!("esec-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let created_at = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO equipment_sections (id, name, created_at) VALUES ($1, $2, $3)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&created_at)
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(EquipmentSection { id, name: body.name, created_at })))
}

async fn update_section(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RenameEquipmentSection>,
) -> Result<StatusCode, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name cannot be empty".into()));
    }
    let res = sqlx::query("UPDATE equipment_sections SET name = $1 WHERE id = $2")
        .bind(&body.name)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_section(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query("DELETE FROM equipment_sections WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── Section equipment ─────────────────────────────────────────────────────────

async fn list_section_equipment(
    State(state): State<AppState>,
    Path(section_id): Path<String>,
) -> Result<Json<Vec<EquipmentItem>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, section_id, name, serial_number, faa_reg_number, \
         status, operator, qty, notes, date_ordered, date_received, group_name, created_at \
         FROM equipment WHERE section_id = $1 ORDER BY created_at",
    )
    .bind(&section_id)
    .fetch_all(&state.pool)
    .await?;

    let items = rows
        .iter()
        .map(|r| {
            Ok(EquipmentItem {
                id: r.try_get("id")?,
                project_id: None,
                section_id: Some(r.try_get::<String, _>("section_id")?),
                subtask_id: None,
                name: r.try_get("name")?,
                serial_number: r.try_get("serial_number")?,
                faa_reg_number: r.try_get("faa_reg_number")?,
                status: r.try_get("status")?,
                operator: r.try_get("operator")?,
                qty: r.try_get("qty")?,
                notes: r.try_get("notes")?,
                date_ordered: r.try_get("date_ordered")?,
                date_received: r.try_get("date_received")?,
                group_name: r.try_get("group_name")?,
                created_at: r.try_get("created_at")?,
                is_virtual: false,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    Ok(Json(items))
}

async fn create_section_equipment(
    State(state): State<AppState>,
    Path(section_id): Path<String>,
    Json(body): Json<CreateEquipment>,
) -> Result<(StatusCode, Json<EquipmentItem>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    let id = format!("equip-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let serial_number  = body.serial_number.unwrap_or_default();
    let faa_reg_number = body.faa_reg_number.unwrap_or_default();
    let status         = body.status.unwrap_or_else(|| "ordered".into());
    let operator       = body.operator.unwrap_or_default();
    let qty: i32       = body.qty.unwrap_or(1).max(1);
    let notes          = body.notes.unwrap_or_default();
    let date_ordered   = body.date_ordered.unwrap_or_default();
    let date_received  = body.date_received.unwrap_or_default();
    let group_name     = body.group_name.unwrap_or_default();
    let created_at     = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO equipment \
         (id, section_id, subtask_id, name, serial_number, faa_reg_number, status, operator, \
          qty, notes, date_ordered, date_received, group_name, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    )
    .bind(&id)
    .bind(&section_id)
    .bind(None::<i64>)
    .bind(&body.name)
    .bind(&serial_number)
    .bind(&faa_reg_number)
    .bind(&status)
    .bind(&operator)
    .bind(qty)
    .bind(&notes)
    .bind(&date_ordered)
    .bind(&date_received)
    .bind(&group_name)
    .bind(&created_at)
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(EquipmentItem {
            id,
            project_id: None,
            section_id: Some(section_id),
            subtask_id: None,
            name: body.name,
            serial_number,
            faa_reg_number,
            status,
            operator,
            qty,
            notes,
            date_ordered,
            date_received,
            group_name,
            created_at,
            is_virtual: false,
        }),
    ))
}
