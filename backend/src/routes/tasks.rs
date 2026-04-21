use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, patch, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{error::AppError, models::*, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/:project_id/phases/:phase_id/tasks", post(create_task))
        .route("/tasks/:task_id", patch(update_task).delete(delete_task))
        .route("/tasks/:task_id/subtasks", post(create_subtask))
        .route("/subtasks/:subtask_id", patch(update_subtask).delete(delete_subtask))
        .route("/tasks/:task_id/stakeholders/:slot_index", patch(update_contact))
}

async fn create_task(
    State(state): State<AppState>,
    Path((project_id, phase_id)): Path<(String, String)>,
    Json(body): Json<CreateTask>,
) -> Result<(StatusCode, Json<TaskFull>), AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("Task title is required".into()));
    }

    let max_order: i64 = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE phase_id = $1",
        phase_id
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(-1) as i64;

    let task_id = format!("ctask-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let assignee = body.assignee.unwrap_or_default();
    let sort_order = max_order + 1;

    sqlx::query!(
        "INSERT INTO tasks (id, phase_id, project_id, title, assignee, is_custom, sort_order) VALUES ($1, $2, $3, $4, $5, TRUE, $6)",
        task_id, phase_id, project_id, body.title, assignee, sort_order as i32
    )
    .execute(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(TaskFull {
        id: task_id,
        phase_id,
        project_id,
        title: body.title,
        completed: false,
        notes: String::new(),
        due_date: String::new(),
        assignee,
        is_gate: false,
        is_custom: true,
        track_dates: false,
        has_stakeholders: false,
        has_equipment_picker: false,
        sort_order,
        role_tag: String::new(),
        stage_number: None,
        subtasks: vec![],
        stakeholder_contacts: vec![],
        attachments: vec![],
    })))
}

async fn update_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    Json(body): Json<UpdateTask>,
) -> Result<StatusCode, AppError> {
    if let Some(title) = &body.title {
        sqlx::query!("UPDATE tasks SET title = $1 WHERE id = $2", title, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(completed) = body.completed {
        sqlx::query!("UPDATE tasks SET completed = $1 WHERE id = $2", completed, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(notes) = &body.notes {
        sqlx::query!("UPDATE tasks SET notes = $1 WHERE id = $2", notes, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(due_date) = &body.due_date {
        sqlx::query!("UPDATE tasks SET due_date = $1 WHERE id = $2", due_date, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(assignee) = &body.assignee {
        sqlx::query!("UPDATE tasks SET assignee = $1 WHERE id = $2", assignee, task_id)
            .execute(&state.pool)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let task = sqlx::query!("SELECT is_custom FROM tasks WHERE id = $1", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if !task.is_custom {
        return Err(AppError::BadRequest("Only custom tasks can be deleted".into()));
    }

    sqlx::query!("DELETE FROM tasks WHERE id = $1", task_id)
        .execute(&state.pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_subtask(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    Json(body): Json<CreateSubtask>,
) -> Result<(StatusCode, Json<SubtaskRow>), AppError> {
    if body.text.trim().is_empty() {
        return Err(AppError::BadRequest("Subtask text is required".into()));
    }

    let project_id = sqlx::query_scalar!("SELECT project_id FROM tasks WHERE id = $1", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let max_idx: i64 = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(sort_index), -1) FROM subtasks WHERE task_id = $1",
        task_id
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(-1) as i64;

    let sort_index = max_idx + 1;

    let id: i64 = sqlx::query_scalar!(
        "INSERT INTO subtasks (task_id, project_id, sort_index, text) VALUES ($1, $2, $3, $4) RETURNING id",
        task_id, project_id, sort_index as i32, body.text
    )
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(SubtaskRow {
        id,
        task_id,
        sort_index: sort_index as i32,
        text: body.text,
        is_done: false,
        note: String::new(),
        ot_ordered: String::new(),
        ot_shipped: String::new(),
        ot_eta: String::new(),
        ot_delivered: String::new(),
        ot_received_by: String::new(),
        priority: String::new(),
        condition_key: String::new(),
    })))
}

async fn update_subtask(
    State(state): State<AppState>,
    Path(subtask_id): Path<i64>,
    Json(body): Json<UpdateSubtask>,
) -> Result<StatusCode, AppError> {
    if let Some(text) = &body.text {
        sqlx::query!("UPDATE subtasks SET text = $1 WHERE id = $2", text, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(is_done) = body.is_done {
        sqlx::query!("UPDATE subtasks SET is_done = $1 WHERE id = $2", is_done, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(note) = &body.note {
        sqlx::query!("UPDATE subtasks SET note = $1 WHERE id = $2", note, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_ordered {
        sqlx::query!("UPDATE subtasks SET ot_ordered = $1 WHERE id = $2", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_shipped {
        sqlx::query!("UPDATE subtasks SET ot_shipped = $1 WHERE id = $2", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_eta {
        sqlx::query!("UPDATE subtasks SET ot_eta = $1 WHERE id = $2", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_delivered {
        sqlx::query!("UPDATE subtasks SET ot_delivered = $1 WHERE id = $2", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_received_by {
        sqlx::query!("UPDATE subtasks SET ot_received_by = $1 WHERE id = $2", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_subtask(
    State(state): State<AppState>,
    Path(subtask_id): Path<i64>,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM subtasks WHERE id = $1", subtask_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn update_contact(
    State(state): State<AppState>,
    Path((task_id, slot_index)): Path<(String, i32)>,
    Json(body): Json<UpdateContact>,
) -> Result<StatusCode, AppError> {
    let project_id = sqlx::query_scalar!("SELECT project_id FROM tasks WHERE id = $1", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    sqlx::query!(
        "INSERT INTO stakeholder_contacts (task_id, project_id, slot_index, name, email, phone) VALUES ($1, $2, $3, '', '', '') ON CONFLICT(task_id, slot_index) DO NOTHING",
        task_id, project_id, slot_index
    )
    .execute(&state.pool)
    .await.ok();

    if let Some(name) = &body.name {
        sqlx::query!(
            "UPDATE stakeholder_contacts SET name = $1 WHERE task_id = $2 AND slot_index = $3",
            name, task_id, slot_index
        )
        .execute(&state.pool)
        .await?;
    }
    if let Some(email) = &body.email {
        sqlx::query!(
            "UPDATE stakeholder_contacts SET email = $1 WHERE task_id = $2 AND slot_index = $3",
            email, task_id, slot_index
        )
        .execute(&state.pool)
        .await?;
    }
    if let Some(phone) = &body.phone {
        sqlx::query!(
            "UPDATE stakeholder_contacts SET phone = $1 WHERE task_id = $2 AND slot_index = $3",
            phone, task_id, slot_index
        )
        .execute(&state.pool)
        .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}
