use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{error::AppError, routes::misc::AppState, template::get_template};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hubspot/status", get(get_status))
        .route("/hubspot/token", put(save_token).delete(delete_token))
        .route("/hubspot/deals", get(list_deals))
        .route("/hubspot/active", get(get_active))
        .route("/hubspot/deal/:deal_id", get(get_deal))
        .route("/hubspot/pin/:deal_id", post(pin_deal).delete(unpin_deal))
}

async fn get_token(state: &AppState) -> Option<String> {
    sqlx::query_scalar!("SELECT value FROM settings WHERE key = 'hubspot_token'")
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
}

async fn get_status(State(state): State<AppState>) -> Json<Value> {
    let connected = get_token(&state).await.is_some();
    Json(json!({ "connected": connected }))
}

#[derive(Deserialize)]
struct SaveTokenBody {
    token: String,
}

async fn save_token(
    State(state): State<AppState>,
    Json(body): Json<SaveTokenBody>,
) -> Result<StatusCode, AppError> {
    sqlx::query!(
        "INSERT INTO settings (key, value) VALUES ('hubspot_token', $1) \
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        body.token
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_token(State(state): State<AppState>) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM settings WHERE key = 'hubspot_token'")
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_deals(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let token = get_token(&state)
        .await
        .ok_or_else(|| AppError::BadRequest("HubSpot not connected".into()))?;

    let base = "https://api.hubapi.com/crm/v3/objects/deals\
                ?limit=100\
                &properties=dealname,dealstage,amount,closedate,pipeline,hs_lastmodifieddate\
                &associations=companies";

    let mut all_deals: Vec<Value> = Vec::new();
    let mut after: Option<String> = None;

    loop {
        let url = match &after {
            Some(cursor) => format!("{}&after={}", base, cursor),
            None => base.to_string(),
        };

        let resp = state
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if !resp.status().is_success() {
            let body: Value = resp.json().await.unwrap_or_default();
            return Err(AppError::Internal(format!("HubSpot API error: {}", body)));
        }

        let page: Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Some(results) = page["results"].as_array() {
            all_deals.extend(results.iter().cloned());
        }

        // Follow cursor — stop when there's no next page
        after = page["paging"]["next"]["after"]
            .as_str()
            .map(|s| s.to_string());

        if after.is_none() {
            break;
        }
    }

    // Annotate each deal with its pinned status
    let pinned: Vec<String> = sqlx::query_scalar!(
        "SELECT hubspot_deal_id FROM projects WHERE hubspot_deal_id IS NOT NULL"
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .flatten()
    .collect();

    let annotated: Vec<Value> = all_deals
        .into_iter()
        .map(|mut deal| {
            let id = deal["id"].as_str().unwrap_or("").to_string();
            deal["pinned"] = json!(pinned.contains(&id));
            deal
        })
        .collect();

    Ok(Json(json!({ "results": annotated })))
}

/// Returns live HubSpot deal data for all pinned (shadow) projects.
async fn get_active(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let linked = sqlx::query!(
        "SELECT id, hubspot_deal_id FROM projects WHERE hubspot_deal_id IS NOT NULL"
    )
    .fetch_all(&state.pool)
    .await?;

    if linked.is_empty() {
        return Ok(Json(json!([])));
    }

    let token = match get_token(&state).await {
        Some(t) => t,
        None => return Ok(Json(json!([]))),
    };

    let inputs: Vec<Value> = linked
        .iter()
        .filter_map(|r| r.hubspot_deal_id.as_ref())
        .map(|id| json!({ "id": id }))
        .collect();

    let batch_resp = state
        .http
        .post("https://api.hubapi.com/crm/v3/objects/deals/batch/read")
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({
            "inputs": inputs,
            "properties": ["dealname", "dealstage", "amount", "closedate", "pipeline", "hs_lastmodifieddate"]
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let batch: Value = batch_resp
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let results = batch["results"].as_array().cloned().unwrap_or_default();

    let active: Vec<Value> = results
        .into_iter()
        .map(|deal| {
            let deal_id = deal["id"].as_str().unwrap_or("").to_string();
            let project_id = linked
                .iter()
                .find(|r| r.hubspot_deal_id.as_deref() == Some(&deal_id))
                .map(|r| r.id.clone())
                .unwrap_or_default();
            json!({ "projectId": project_id, "deal": deal })
        })
        .collect();

    Ok(Json(json!(active)))
}

/// Full deal detail with company + contact associations.
async fn get_deal(
    State(state): State<AppState>,
    Path(deal_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let token = get_token(&state)
        .await
        .ok_or_else(|| AppError::BadRequest("HubSpot not connected".into()))?;

    let url = format!(
        "https://api.hubapi.com/crm/v3/objects/deals/{}\
         ?properties=dealname,dealstage,amount,closedate,pipeline,description,hs_lastmodifieddate\
         &associations=companies,contacts",
        deal_id
    );

    let resp = state
        .http
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let deal: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut result = deal.clone();

    // Resolve associated companies
    let company_ids: Vec<String> = deal["associations"]["companies"]["results"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|c| c["id"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    if !company_ids.is_empty() {
        let inputs: Vec<Value> = company_ids.iter().map(|id| json!({ "id": id })).collect();
        if let Ok(resp) = state.http
            .post("https://api.hubapi.com/crm/v3/objects/companies/batch/read")
            .header("Authorization", format!("Bearer {}", token))
            .json(&json!({ "inputs": inputs, "properties": ["name", "domain"] }))
            .send().await
        {
            if let Ok(data) = resp.json::<Value>().await {
                result["companyDetails"] = data["results"].clone();
            }
        }
    }

    // Resolve associated contacts
    let contact_ids: Vec<String> = deal["associations"]["contacts"]["results"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|c| c["id"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    if !contact_ids.is_empty() {
        let inputs: Vec<Value> = contact_ids.iter().map(|id| json!({ "id": id })).collect();
        if let Ok(resp) = state.http
            .post("https://api.hubapi.com/crm/v3/objects/contacts/batch/read")
            .header("Authorization", format!("Bearer {}", token))
            .json(&json!({
                "inputs": inputs,
                "properties": ["firstname", "lastname", "email", "phone", "jobtitle", "company"]
            }))
            .send().await
        {
            if let Ok(data) = resp.json::<Value>().await {
                result["contactDetails"] = data["results"].clone();
            }
        }
    }

    Ok(Json(result))
}

/// Create a shadow project linked to this HubSpot deal.
async fn pin_deal(
    State(state): State<AppState>,
    Path(deal_id): Path<String>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    // Idempotent — return existing project if already pinned
    if let Some(existing_id) = sqlx::query_scalar!(
        "SELECT id FROM projects WHERE hubspot_deal_id = $1",
        deal_id
    )
    .fetch_optional(&state.pool)
    .await?
    {
        return Ok((
            StatusCode::OK,
            Json(json!({ "projectId": existing_id, "created": false })),
        ));
    }

    let token = get_token(&state)
        .await
        .ok_or_else(|| AppError::BadRequest("HubSpot not connected".into()))?;

    // Fetch deal to seed project name
    let url = format!(
        "https://api.hubapi.com/crm/v3/objects/deals/{}\
         ?properties=dealname,dealstage&associations=companies",
        deal_id
    );
    let deal: Value = state
        .http
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let name = deal["properties"]["dealname"]
        .as_str()
        .unwrap_or("HubSpot Deal")
        .to_string();

    let project_id = format!("proj-{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);
    let created_at = chrono::Utc::now().to_rfc3339();

    sqlx::query!(
        "INSERT INTO projects (id, name, client, site, created_at, hubspot_deal_id) \
         VALUES ($1, $2, $3, $4, $5, $6)",
        project_id,
        name,
        "",
        "",
        created_at,
        deal_id
    )
    .execute(&state.pool)
    .await?;

    // Seed phases/tasks from template
    let template = get_template();
    for (ph_idx, ph) in template.iter().enumerate() {
        let phase_id = format!("{}-{}", &project_id[..12], ph.id);
        let unlocked = ph_idx == 0;
        let ph_sort = ph_idx as i32;

        sqlx::query!(
            "INSERT INTO phases (id, project_id, phase_number, title, color, description, unlocked, sort_order) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            phase_id, project_id, ph.phase_number, ph.title, ph.color, ph.description, unlocked, ph_sort
        )
        .execute(&state.pool)
        .await?;

        for (t_idx, task) in ph.tasks.iter().enumerate() {
            let task_id = format!("{}-{}", &project_id[..12], task.id);
            let t_sort = t_idx as i32;

            sqlx::query!(
                "INSERT INTO tasks (id, phase_id, project_id, title, is_gate, track_dates, \
                 has_equipment_picker, has_stakeholders, sort_order) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                task_id, phase_id, project_id, task.title, task.gate,
                task.track_dates, task.has_equipment_picker, task.has_stakeholders, t_sort
            )
            .execute(&state.pool)
            .await?;

            for (s_idx, sub_text) in task.subtasks.iter().enumerate() {
                let sub = sub_text.to_string();
                let s_sort = s_idx as i32;
                sqlx::query!(
                    "INSERT INTO subtasks (task_id, project_id, sort_index, text) VALUES ($1, $2, $3, $4)",
                    task_id, project_id, s_sort, sub
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

    Ok((
        StatusCode::CREATED,
        Json(json!({ "projectId": project_id, "created": true })),
    ))
}

/// Remove a shadow project and its linked HubSpot deal.
async fn unpin_deal(
    State(state): State<AppState>,
    Path(deal_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let res = sqlx::query!(
        "DELETE FROM projects WHERE hubspot_deal_id = $1",
        deal_id
    )
    .execute(&state.pool)
    .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
