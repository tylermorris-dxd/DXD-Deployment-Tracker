use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post, put, delete},
    Json, Router,
};
use serde::Deserialize;
use sqlx::{postgres::PgRow, Row};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::*,
    routes::misc::AppState,
    template::get_template,
};

// Project summary projection, shared by the list and the post-update refetch.
// Kept as a dynamic query rather than the query! macro because migrations run
// at startup, not at build time — every new projects column would otherwise
// risk a compile against a schema that doesn't have it yet.
const PROJECT_SUMMARY_SELECT: &str = r#"
    SELECT p.id, p.name, p.client, p.site, p.created_at, p.hubspot_deal_id,
           p.faa_authorization_required, p.faa_auth_started_at,
           p.steady_state, p.steady_state_at,
           p.install_date, p.install_end_date, p.install_status,
           p.assigned_tech, p.schedule_notes,
           COUNT(t.id) FILTER (WHERE t.stage_number IS NULL OR t.stage_number NOT IN (11, 12)) as total_tasks,
           SUM(CASE WHEN t.completed = TRUE THEN 1 ELSE 0 END) FILTER (WHERE t.stage_number IS NULL OR t.stage_number NOT IN (11, 12)) as done_tasks,
           MIN(CASE WHEN t.completed = FALSE AND t.stage_number IS NOT NULL AND t.stage_number NOT IN (11, 12) THEN t.stage_number END) as current_stage
    FROM projects p
    LEFT JOIN phases ph ON ph.project_id = p.id
    LEFT JOIN tasks t ON t.phase_id = ph.id
"#;

fn row_to_summary(r: &PgRow) -> ProjectSummary {
    ProjectSummary {
        id: r.get("id"),
        name: r.get("name"),
        client: r.get("client"),
        site: r.get("site"),
        created_at: r.get("created_at"),
        total_tasks: r.try_get::<Option<i64>, _>("total_tasks").unwrap_or(None).unwrap_or(0),
        done_tasks: r.try_get::<Option<i64>, _>("done_tasks").unwrap_or(None).unwrap_or(0),
        hubspot_deal_id: r.try_get("hubspot_deal_id").unwrap_or(None),
        current_stage: r.try_get("current_stage").unwrap_or(None),
        faa_authorization_required: r.get("faa_authorization_required"),
        faa_auth_started_at: r.try_get("faa_auth_started_at").unwrap_or(None),
        steady_state: r.get("steady_state"),
        steady_state_at: r.try_get("steady_state_at").unwrap_or(None),
        install_date: r.try_get("install_date").unwrap_or(None),
        install_end_date: r.try_get("install_end_date").unwrap_or(None),
        install_status: r
            .try_get::<Option<String>, _>("install_status")
            .unwrap_or(None)
            .unwrap_or_else(|| "unscheduled".to_string()),
        assigned_tech: r.try_get("assigned_tech").unwrap_or(None),
        schedule_notes: r.try_get("schedule_notes").unwrap_or(None),
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/:id", get(get_project).patch(update_project).delete(delete_project))
        .route("/projects/:id/phases/:phase_id", patch(update_phase))
        .route("/projects/:id/branch-answers", patch(update_branch_answers))
        .route("/projects/:id/ops-plan", get(get_ops_plan).put(save_ops_plan))
}

async fn list_projects(State(state): State<AppState>) -> Result<Json<Vec<ProjectSummary>>, AppError> {
    let sql = format!("{PROJECT_SUMMARY_SELECT} GROUP BY p.id ORDER BY p.created_at DESC");
    let rows = sqlx::query(&sql).fetch_all(&state.pool).await?;
    let summaries = rows.iter().map(row_to_summary).collect();

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
                "INSERT INTO tasks (id, phase_id, project_id, title, is_gate, track_dates, has_equipment_picker, has_stakeholders, sort_order, role_tag, stage_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                task_id, phase_id, project_id, task.title, task.gate, task.track_dates, task.has_equipment_picker, task.has_stakeholders, t_sort, task.role_tag, task.stage_number
            )
            .execute(&state.pool)
            .await?;

            for (s_idx, sub) in task.subtasks.iter().enumerate() {
                let s_sort = s_idx as i32;
                sqlx::query!(
                    "INSERT INTO subtasks (task_id, project_id, sort_index, text, priority, condition_key) VALUES ($1, $2, $3, $4, $5, $6)",
                    task_id, project_id, s_sort, sub.text, sub.priority, sub.condition_key
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
        total_tasks: template.iter().flat_map(|p| p.tasks.iter()).filter(|t| t.stage_number < 11).count() as i64,
        done_tasks: 0,
        hubspot_deal_id: None,
        current_stage: Some(1),
        faa_authorization_required: false,
        faa_auth_started_at: None,
        steady_state: false,
        steady_state_at: None,
        // Mirrors the column defaults from migration 020 — a new deal has
        // nothing scheduled until ops puts it on the timeline.
        install_date: None,
        install_end_date: None,
        install_status: "unscheduled".to_string(),
        assigned_tech: None,
        schedule_notes: None,
    };

    Ok((StatusCode::CREATED, Json(summary)))
}

async fn get_project(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<Json<ProjectFull>, AppError> {
    let proj = sqlx::query!(
        "SELECT id, name, client, site, created_at, map_cache, airspace_cache, network_cache, weather_cache, pricing_cache, hubspot_deal_id, branch_answers, faa_authorization_required, faa_auth_started_at, steady_state, steady_state_at FROM projects WHERE id = $1",
        project_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    // Fetched separately rather than added to the macro query above: rf_cache
    // arrives in migration 021, and the query! macro is checked against
    // whatever schema the build host can reach.
    let rf_cache: Option<String> = sqlx::query("SELECT rf_cache FROM projects WHERE id = $1")
        .bind(&project_id)
        .fetch_optional(&state.pool)
        .await?
        .and_then(|r| r.try_get::<Option<String>, _>("rf_cache").unwrap_or(None));

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
                      is_gate, is_custom, track_dates, has_stakeholders, has_equipment_picker, sort_order,
                      role_tag, stage_number
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
            "SELECT id, task_id, sort_index, text, is_done, note, ot_ordered, ot_shipped, ot_eta, ot_delivered, ot_received_by, priority, condition_key FROM subtasks WHERE project_id = $1 ORDER BY task_id, sort_index",
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
                            priority: s.priority.clone(),
                            condition_key: s.condition_key.clone(),
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
                        role_tag: t.role_tag.clone(),
                        stage_number: t.stage_number,
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
        pricing_cache: proj.pricing_cache,
        rf_cache,
        hubspot_deal_id: proj.hubspot_deal_id,
        branch_answers: serde_json::from_str(&proj.branch_answers)
            .unwrap_or_else(|_| serde_json::json!({})),
        faa_authorization_required: proj.faa_authorization_required,
        faa_auth_started_at: proj.faa_auth_started_at,
        steady_state: proj.steady_state,
        steady_state_at: proj.steady_state_at,
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
    if let Some(v) = &body.pricing_cache {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query!("UPDATE projects SET pricing_cache = $1 WHERE id = $2", s, project_id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(faa_req) = body.faa_authorization_required {
        if faa_req {
            let now = chrono::Utc::now().to_rfc3339();
            sqlx::query!(
                "UPDATE projects SET faa_authorization_required = TRUE, faa_auth_started_at = COALESCE(faa_auth_started_at, $1) WHERE id = $2",
                now, project_id
            )
            .execute(&state.pool)
            .await?;
        } else {
            sqlx::query!(
                "UPDATE projects SET faa_authorization_required = FALSE, faa_auth_started_at = NULL WHERE id = $1",
                project_id
            )
            .execute(&state.pool)
            .await?;
        }
    }
    if let Some(v) = &body.rf_cache {
        let s = v.as_str().map(|s| s.to_string());
        sqlx::query("UPDATE projects SET rf_cache = $1 WHERE id = $2")
            .bind(s)
            .bind(&project_id)
            .execute(&state.pool)
            .await?;
    }

    // Scheduling fields. Each accepts an explicit null to clear the value,
    // which is how ops un-schedules a job without deleting the deal.
    for (col, val) in [
        ("install_date", &body.install_date),
        ("install_end_date", &body.install_end_date),
        ("assigned_tech", &body.assigned_tech),
        ("schedule_notes", &body.schedule_notes),
    ] {
        if let Some(v) = val {
            let s = v.as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            // Column name is from the fixed literal array above, never user input.
            let sql = format!("UPDATE projects SET {col} = $1 WHERE id = $2");
            sqlx::query(&sql)
                .bind(s)
                .bind(&project_id)
                .execute(&state.pool)
                .await?;
        }
    }
    if let Some(status) = &body.install_status {
        const ALLOWED: &[&str] = &["unscheduled", "scheduled", "in_progress", "complete", "blocked"];
        if !ALLOWED.contains(&status.as_str()) {
            return Err(AppError::BadRequest(format!("invalid install_status: {status}")));
        }
        sqlx::query("UPDATE projects SET install_status = $1 WHERE id = $2")
            .bind(status)
            .bind(&project_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(steady) = body.steady_state {
        if steady {
            let now = chrono::Utc::now().to_rfc3339();
            sqlx::query!(
                "UPDATE projects SET steady_state = TRUE, steady_state_at = COALESCE(steady_state_at, $1) WHERE id = $2",
                now, project_id
            )
            .execute(&state.pool)
            .await?;
        } else {
            sqlx::query!(
                "UPDATE projects SET steady_state = FALSE, steady_state_at = NULL WHERE id = $1",
                project_id
            )
            .execute(&state.pool)
            .await?;
        }
    }

    let sql = format!("{PROJECT_SUMMARY_SELECT} WHERE p.id = $1 GROUP BY p.id");
    let row = sqlx::query(&sql)
        .bind(&project_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(row_to_summary(&row)))
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

#[derive(Deserialize)]
struct BranchAnswersBody {
    answers: std::collections::HashMap<String, bool>,
}

async fn update_branch_answers(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(body): Json<BranchAnswersBody>,
) -> Result<StatusCode, AppError> {
    let json_str = serde_json::to_string(&body.answers)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let res = sqlx::query!(
        "UPDATE projects SET branch_answers = $1 WHERE id = $2",
        json_str, project_id
    )
    .execute(&state.pool)
    .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn get_ops_plan(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query!("SELECT ops_plan FROM projects WHERE id = $1", id)
        .fetch_optional(&state.pool)
        .await?;
    match row {
        None => Err(AppError::NotFound),
        Some(r) => Ok(Json(serde_json::json!({ "opsPlan": r.ops_plan }))),
    }
}

async fn save_ops_plan(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, AppError> {
    let plan_str = serde_json::to_string(&body)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let res = sqlx::query!(
        "UPDATE projects SET ops_plan = $1 WHERE id = $2",
        plan_str, id
    )
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
