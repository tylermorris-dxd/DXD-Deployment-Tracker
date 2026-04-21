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
        .route("/team", get(list_team).post(create_member))
        .route("/team/:id", patch(update_member).delete(delete_member))
        .route("/admin-tasks", get(list_admin_tasks).post(create_admin_task))
        .route("/admin-tasks/:id", patch(update_admin_task).delete(delete_admin_task))
}

async fn list_team(State(state): State<AppState>) -> Result<Json<Vec<TeamMember>>, AppError> {
    let rows = sqlx::query!("SELECT id, name, role, email FROM team_members ORDER BY name")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows.into_iter().map(|r| TeamMember { id: r.id, name: r.name, role: r.role, email: r.email }).collect()))
}

async fn create_member(
    State(state): State<AppState>,
    Json(body): Json<CreateTeamMember>,
) -> Result<(StatusCode, Json<TeamMember>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }
    let id = format!("member-{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let role = body.role.unwrap_or_default();
    let email = body.email.unwrap_or_default();
    sqlx::query!(
        "INSERT INTO team_members (id, name, role, email) VALUES ($1, $2, $3, $4)",
        id, body.name, role, email
    )
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(TeamMember { id, name: body.name, role, email })))
}

async fn update_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateTeamMember>,
) -> Result<Json<TeamMember>, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }
    let role = body.role.unwrap_or_default();
    let email = body.email.unwrap_or_default();
    sqlx::query!(
        "UPDATE team_members SET name = $1, role = $2, email = $3 WHERE id = $4",
        body.name, role, email, id
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(TeamMember { id, name: body.name, role, email }))
}

async fn delete_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM team_members WHERE id = $1", id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_admin_tasks(State(state): State<AppState>) -> Result<Json<Vec<AdminTask>>, AppError> {
    let rows = sqlx::query!(
        "SELECT id, title, description, assignee, due_date, priority, status, created_at FROM admin_tasks ORDER BY created_at DESC"
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows.into_iter().map(|r| AdminTask {
        id: r.id, title: r.title, description: r.description,
        assignee: r.assignee, due_date: r.due_date, priority: r.priority,
        status: r.status, created_at: r.created_at,
    }).collect()))
}

async fn create_admin_task(
    State(state): State<AppState>,
    Json(body): Json<CreateAdminTask>,
) -> Result<(StatusCode, Json<AdminTask>), AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("Title is required".into()));
    }
    let id = format!("atask-{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let description = body.description.unwrap_or_default();
    let assignee = body.assignee.unwrap_or_default();
    let due_date = body.due_date.unwrap_or_default();
    let priority = body.priority.unwrap_or_else(|| "medium".into());
    let created_at = chrono::Utc::now().to_rfc3339();
    sqlx::query!(
        "INSERT INTO admin_tasks (id, title, description, assignee, due_date, priority, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        id, body.title, description, assignee, due_date, priority, created_at
    )
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(AdminTask {
        id, title: body.title, description, assignee, due_date, priority,
        status: "todo".into(), created_at,
    })))
}

async fn update_admin_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateAdminTask>,
) -> Result<StatusCode, AppError> {
    if let Some(v) = &body.title {
        sqlx::query!("UPDATE admin_tasks SET title = $1 WHERE id = $2", v, id).execute(&state.pool).await?;
    }
    if let Some(v) = &body.description {
        sqlx::query!("UPDATE admin_tasks SET description = $1 WHERE id = $2", v, id).execute(&state.pool).await?;
    }
    if let Some(v) = &body.assignee {
        sqlx::query!("UPDATE admin_tasks SET assignee = $1 WHERE id = $2", v, id).execute(&state.pool).await?;
    }
    if let Some(v) = &body.due_date {
        sqlx::query!("UPDATE admin_tasks SET due_date = $1 WHERE id = $2", v, id).execute(&state.pool).await?;
    }
    if let Some(v) = &body.priority {
        sqlx::query!("UPDATE admin_tasks SET priority = $1 WHERE id = $2", v, id).execute(&state.pool).await?;
    }
    if let Some(v) = &body.status {
        sqlx::query!("UPDATE admin_tasks SET status = $1 WHERE id = $2", v, id).execute(&state.pool).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_admin_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM admin_tasks WHERE id = $1", id).execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
