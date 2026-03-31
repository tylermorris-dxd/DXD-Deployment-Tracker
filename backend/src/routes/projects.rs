use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post, delete},
    Json, Router,
};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::*,
    routes::misc::AppState,
    template::get_template,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/:id", get(get_project).patch(update_project).delete(delete_project))
        .route("/projects/:id/phases/:phase_id", patch(update_phase))
}

async fn list_projects(State(state): State<AppState>) -> Result<Json<Vec<ProjectSummary>>, AppError> {
    let rows = sqlx::query!(
        r#"
        SELECT p.id, p.name, p.client, p.site, p.created_at,
               COUNT(t.id) as total_tasks,
               SUM(CASE WHEN t.completed = TRUE THEN 1 ELSE 0 END) as done_tasks
        FROM projects p
        LEFT JOIN phases ph ON ph.project_id = p.id
        LEFT JOIN tasks t ON t.phase_id = ph.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
        "#
    )
    .fetch_all(&state.pool)
    .await?;

    let summaries = rows
        .into_iter()
        .map(|r| ProjectSummary {
            id: r.id,
            name: r.name,
            client: r.client,
            site: r.site,
            created_at: r.created_at,
            total_tasks: r.total_tasks.unwrap_or(0),
            done_tasks: r.done_tasks.unwrap_or(0),
        })
        .collect();

    Ok(Json(summaries))
}

async fn create_project(
    State(state): State<AppState>,
    Json(body): Json<CreateProject>,
) -> Result<(StatusCode, Json<ProjectSummary>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Project name is required".into()));
    }

    let project_id = format!("proj-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let client = body.client.unwrap_or_default();
    let site = body.site.unwrap_or_default();
    let created_at = chrono::Utc::now().to_rfc3339();

    sqlx::query!(
        "INSERT INTO projects (id, name, client, site, created_at) VALUES ($1, $2, $3, $4, $5)",
        project_id, body.name, client, site, created_at
    )
    .execute(&state.pool)
    .await?;

    // Seed phases and tasks from template
    let template = get_template();
    for (ph_idx, ph) in template.iter().enumerate() {
        let phase_id = format!("{}-{}", &project_id[..12], ph.id);
        let unlocked = ph_idx == 0;
        let ph_sort = ph_idx as i32;

        sqlx::query!(
            "INSERT INTO phases (id, project_id, phase_number, title, color, description, unlocked, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            phase_id, project_id, ph.phase_number, ph.title, ph.color, ph.description, unlocked, ph_sort
        )
        .execute(&state.pool)
        .await?;

        for (t_idx, task) in ph.tasks.iter().enumerate() {
            let task_id = format!("{}-{}", &project_id[..12], task.id);
            let t_sort = t_idx as i32;

            sqlx::query!(
                "INSERT INTO tasks (id, phase_id, project_id, title, is_gate, track_dates, has_equipment_picker, has_stakeholders, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                task_id, phase_id, project_id, task.title, task.gate, task.track_dates, task.has_equipment_picker, task.has_stakeholders, t_sort
            )
            .execute(&state.pool)
            .await?;

            for (s_idx, sub_text) in task.subtasks.iter().enumerate() {
                let sub_text = sub_text.to_string();
                let s_sort = s_idx as i32;
                sqlx::query!(
                    "INSERT INTO subtasks (task_id, project_id, sort_index, text) VALUES ($1, $2, $3, $4)",
                    task_id, project_id, s_sort, sub_text
                )
                .execute(&state.pool)
                .await?;
            }

            if task.has_stakeholders {
                for slot in 0..5i32 {
                    sqlx::query!(
                        "INSERT INTO stakeholder_contacts (task_id, project_id, slot_index) VALUES ($1, $2, $3)",
                        task_id, project_id, slot
                    )
                    .execute(&state.pool)
                    .await?;
                }
            }
        }
    }

    let summary = ProjectSummary {
        id: project_id,
        name: body.name,
        client,
        site,
        created_at,
        total_tasks: template.iter().map(|p| p.tasks.len() as i64).sum(),
        done_tasks: 0,
    };

    Ok((StatusCode::CREATED, Json(summary)))
}

async fn get_project(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<Json<ProjectFull>, AppError> {
    let proj = sqlx::query!(
        "SELECT id, name, client, site, created_at, map_cache, airspace_cache, network_cache, weather_cache FROM projects WHERE id = $1",
        project_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let phases_raw = sqlx::query!(
        "SELECT id, project_id, phase_number, title, color, description, owner, unlocked, completed_at, sort_order FROM phases WHERE project_id = $1 ORDER BY sort_order",
        project_id
    )
    .fetch_all(&state.pool)
    .await?;

    let tasks_raw = if phases_raw.is_empty() {
        vec![]
    } else {
        sqlx::query!(
            r#"SELECT id, phase_id, project_id, title, completed, notes, due_date, assignee,
                      is_gate, is_custom, track_dates, has_stakeholders, has_equipment_picker, sort_order
               FROM tasks WHERE project_id = $1 ORDER BY phase_id, sort_order"#,
            project_id
        )
        .fetch_all(&state.pool)
        .await?
    };

    let tasks_empty = tasks_raw.is_empty();

    let subtasks_raw = if tasks_empty {
        vec![]
    } else {
        sqlx::query!(
            "SELECT id, task_id, sort_index, text, is_done, note, ot_ordered, ot_shipped, ot_eta, ot_delivered, ot_received_by FROM subtasks WHERE project_id = $1 ORDER BY task_id, sort_index",
            project_id
        )
        .fetch_all(&state.pool)
        .await?
    };

    let contacts_raw = if tasks_empty {
        vec![]
    } else {
        sqlx::query!(
            "SELECT id, task_id, slot_index, name, email, phone FROM stakeholder_contacts WHERE project_id = $1 ORDER BY task_id, slot_index",
            project_id
        )
        .fetch_all(&state.pool)
        .await?
    };

    let attachments_raw = if tasks_empty {
        vec![]
    } else {
        sqlx::query!(
            "SELECT id, task_id, name, mime_type, size_bytes, added_at, added_by FROM attachments WHERE project_id = $1 ORDER BY task_id, added_at",
            project_id
        )
        .fetch_all(&state.pool)
        .await?
    };

    let phases: Vec<PhaseFull> = phases_raw
        .into_iter()
        .map(|ph| {
            let tasks: Vec<TaskFull> = tasks_raw
                .iter()
                .filter(|t| t.phase_id == ph.id)
                .map(|t| {
                    let subtasks: Vec<SubtaskRow> = subtasks_raw
                        .iter()
                        .filter(|s| s.task_id == t.id)
                        .map(|s| SubtaskRow {
                            id: s.id,
                            task_id: s.task_id.clone(),
                            sort_index: s.sort_index,
                            text: s.text.clone(),
                            is_done: s.is_done,
                            note: s.note.clone(),
                            ot_ordered: s.ot_ordered.clone(),
                            ot_shipped: s.ot_shipped.clone(),
                            ot_eta: s.ot_eta.clone(),
                            ot_delivered: s.ot_delivered.clone(),
                            ot_received_by: s.ot_received_by.clone(),
                        })
                        .collect();

                    let stakeholder_contacts: Vec<ContactRow> = contacts_raw
                        .iter()
                        .filter(|c| c.task_id == t.id)
                        .map(|c| ContactRow {
                            id: c.id,
                            task_id: c.task_id.clone(),
                            slot_index: c.slot_index,
                            name: c.name.clone(),
                            email: c.email.clone(),
                            phone: c.phone.clone(),
                        })
                        .collect();

                    let attachments: Vec<AttachmentMeta> = attachments_raw
                        .iter()
                        .filter(|a| a.task_id == t.id)
                        .map(|a| AttachmentMeta {
                            id: a.id.clone(),
                            task_id: a.task_id.clone(),
                            name: a.name.clone(),
                            mime_type: a.mime_type.clone(),
                            size_bytes: a.size_bytes,
                            added_at: a.added_at.clone(),
                            added_by: a.added_by.clone(),
                        })
                        .collect();

                    TaskFull {
                        id: t.id.clone(),
                        phase_id: t.phase_id.clone(),
                        project_id: t.project_id.clone(),
                        title: t.title.clone(),
                        completed: t.completed,
                        notes: t.notes.clone(),
                        due_date: t.due_date.clone(),
                        assignee: t.assignee.clone(),
                        is_gate: t.is_gate,
                        is_custom: t.is_custom,
                        track_dates: t.track_dates,
                        has_stakeholders: t.has_stakeholders,
                        has_equipment_picker: t.has_equipment_picker,
                        sort_order: t.sort_order as i64,
                        subtasks,
                        stakeholder_contacts,
                        attachments,
                    }
                })
                .collect();

            PhaseFull {
                id: ph.id,
                project_id: ph.project_id,
                phase_number: ph.phase_number,
                title: ph.title,
                color: ph.color,
                description: ph.description,
                owner: ph.owner,
                unlocked: ph.unlocked,
                completed_at: ph.completed_at,
                sort_order: ph.sort_order,
                tasks,
            }
        })
        .collect();

    Ok(Json(ProjectFull {
        id: proj.id,
        name: proj.name,
        client: proj.client,
        site: proj.site,
        created_at: proj.created_at,
        map_cache: proj.map_cache,
        airspace_cache: proj.airspace_cache,
        network_cache: proj.network_cache,
        weather_cache: proj.weather_cache,
        phases,
    }))
}

async fn update_project(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(body): Json<UpdateProject>,
) -> Result<Json<ProjectSummary>, AppError> {
    if let Some(name) = &body.name {
        sqlx::query!("UPDATE projects SET name = $1 WHERE id = $2", name, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(client) = &body.client {
        sqlx::query!("UPDATE projects SET client = $1 WHERE id = $2", client, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(site) = &body.site {
        sqlx::query!("UPDATE projects SET site = $1 WHERE id = $2", site, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.map_cache {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query!("UPDATE projects SET map_cache = $1 WHERE id = $2", s, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.airspace_cache {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query!("UPDATE projects SET airspace_cache = $1 WHERE id = $2", s, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.network_cache {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query!("UPDATE projects SET network_cache = $1 WHERE id = $2", s, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.weather_cache {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query!("UPDATE projects SET weather_cache = $1 WHERE id = $2", s, project_id)
            .execute(&state.pool)
            .await?;
    }

    let row = sqlx::query!(
        r#"SELECT p.id, p.name, p.client, p.site, p.created_at,
                  COUNT(t.id) as total_tasks,
                  SUM(CASE WHEN t.completed = TRUE THEN 1 ELSE 0 END) as done_tasks
           FROM projects p
           LEFT JOIN phases ph ON ph.project_id = p.id
           LEFT JOIN tasks t ON t.phase_id = ph.id
           WHERE p.id = $1
           GROUP BY p.id"#,
        project_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(ProjectSummary {
        id: row.id,
        name: row.name,
        client: row.client,
        site: row.site,
        created_at: row.created_at,
        total_tasks: row.total_tasks.unwrap_or(0),
        done_tasks: row.done_tasks.unwrap_or(0),
    }))
}

async fn delete_project(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query!("DELETE FROM projects WHERE id = $1", project_id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn update_phase(
    State(state): State<AppState>,
    Path((project_id, phase_id)): Path<(String, String)>,
    Json(body): Json<UpdatePhase>,
) -> Result<StatusCode, AppError> {
    let exists = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM phases WHERE id = $1 AND project_id = $2",
        phase_id, project_id
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);
    if exists == 0 {
        return Err(AppError::NotFound);
    }

    if let Some(owner) = &body.owner {
        sqlx::query!("UPDATE phases SET owner = $1 WHERE id = $2", owner, phase_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(unlocked) = body.unlocked {
        sqlx::query!("UPDATE phases SET unlocked = $1 WHERE id = $2", unlocked, phase_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.completed_at {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query!("UPDATE phases SET completed_at = $1 WHERE id = $2", s, phase_id)
            .execute(&state.pool)
            .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}
