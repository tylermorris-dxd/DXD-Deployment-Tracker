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

    // Get current max sort_order in this phase
    let max_order: i64 = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE phase_id = ?",
        phase_id
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(-1);

    let task_id = format!("ctask-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let assignee = body.assignee.unwrap_or_default();
    let sort_order = max_order + 1;

    sqlx::query!(
        "INSERT INTO tasks (id, phase_id, project_id, title, assignee, is_custom, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)",
        task_id, phase_id, project_id, body.title, assignee, sort_order
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
        sqlx::query!("UPDATE tasks SET title = ? WHERE id = ?", title, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(completed) = body.completed {
        let v: i64 = if completed { 1 } else { 0 };
        sqlx::query!("UPDATE tasks SET completed = ? WHERE id = ?", v, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(notes) = &body.notes {
        sqlx::query!("UPDATE tasks SET notes = ? WHERE id = ?", notes, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(due_date) = &body.due_date {
        sqlx::query!("UPDATE tasks SET due_date = ? WHERE id = ?", due_date, task_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(assignee) = &body.assignee {
        sqlx::query!("UPDATE tasks SET assignee = ? WHERE id = ?", assignee, task_id)
            .execute(&state.pool)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let task = sqlx::query!("SELECT is_custom FROM tasks WHERE id = ?", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if task.is_custom == 0 {
        return Err(AppError::BadRequest("Only custom tasks can be deleted".into()));
    }

    sqlx::query!("DELETE FROM tasks WHERE id = ?", task_id)
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

    let project_id = sqlx::query_scalar!("SELECT project_id FROM tasks WHERE id = ?", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let max_idx: i64 = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(sort_index), -1) FROM subtasks WHERE task_id = ?",
        task_id
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(-1);

    let sort_index = max_idx + 1;

    let result = sqlx::query!(
        "INSERT INTO subtasks (task_id, project_id, sort_index, text) VALUES (?, ?, ?, ?)",
        task_id, project_id, sort_index, body.text
    )
    .execute(&state.pool)
    .await?;

    let id = result.last_insert_rowid();

    Ok((StatusCode::CREATED, Json(SubtaskRow {
        id,
        task_id,
        sort_index,
        text: body.text,
        is_done: false,
        note: String::new(),
        ot_ordered: String::new(),
        ot_shipped: String::new(),
        ot_eta: String::new(),
        ot_delivered: String::new(),
        ot_received_by: String::new(),
    })))
}

async fn update_subtask(
    State(state): State<AppState>,
    Path(subtask_id): Path<i64>,
    Json(body): Json<UpdateSubtask>,
) -> Result<StatusCode, AppError> {
    if let Some(text) = &body.text {
        sqlx::query!("UPDATE subtasks SET text = ? WHERE id = ?", text, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(is_done) = body.is_done {
        let v: i64 = if is_done { 1 } else { 0 };
        sqlx::query!("UPDATE subtasks SET is_done = ? WHERE id = ?", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(note) = &body.note {
        sqlx::query!("UPDATE subtasks SET note = ? WHERE id = ?", note, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_ordered {
        sqlx::query!("UPDATE subtasks SET ot_ordered = ? WHERE id = ?", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_shipped {
        sqlx::query!("UPDATE subtasks SET ot_shipped = ? WHERE id = ?", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_eta {
        sqlx::query!("UPDATE subtasks SET ot_eta = ? WHERE id = ?", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_delivered {
        sqlx::query!("UPDATE subtasks SET ot_delivered = ? WHERE id = ?", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.ot_received_by {
        sqlx::query!("UPDATE subtasks SET ot_received_by = ? WHERE id = ?", v, subtask_id)
            .execute(&state.pool)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_subtask(
    State(state): State<AppState>,
    Path(subtask_id): Path<i64>,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM subtasks WHERE id = ?", subtask_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn update_contact(
    State(state): State<AppState>,
    Path((task_id, slot_index)): Path<(String, i64)>,
    Json(body): Json<UpdateContact>,
) -> Result<StatusCode, AppError> {
    let project_id = sqlx::query_scalar!("SELECT project_id FROM tasks WHERE id = ?", task_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    // Upsert: insert if not exists, update if exists
    sqlx::query!(
        "INSERT INTO stakeholder_contacts (task_id, project_id, slot_index, name, email, phone) VALUES (?, ?, ?, '', '', '') ON CONFLICT(task_id, slot_index) DO NOTHING",
        task_id, project_id, slot_index
    )
    .execute(&state.pool)
    .await.ok();

    if let Some(name) = &body.name {
        sqlx::query!(
            "UPDATE stakeholder_contacts SET name = ? WHERE task_id = ? AND slot_index = ?",
            name, task_id, slot_index
        )
        .execute(&state.pool)
        .await?;
    }
    if let Some(email) = &body.email {
        sqlx::query!(
            "UPDATE stakeholder_contacts SET email = ? WHERE task_id = ? AND slot_index = ?",
            email, task_id, slot_index
        )
        .execute(&state.pool)
        .await?;
    }
    if let Some(phone) = &body.phone {
        sqlx::query!(
            "UPDATE stakeholder_contacts SET phone = ? WHERE task_id = ? AND slot_index = ?",
            phone, task_id, slot_index
        )
        .execute(&state.pool)
        .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}
