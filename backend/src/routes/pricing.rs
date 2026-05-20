use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch},
    Json, Router,
};
use uuid::Uuid;

use crate::{error::AppError, models::*, routes::misc::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pricing-catalog", get(list_catalog).post(create_item))
        .route("/pricing-catalog/:id", patch(update_item).delete(delete_item))
}

async fn list_catalog(State(state): State<AppState>) -> Result<Json<Vec<PricingCatalogItem>>, AppError> {
    let rows = sqlx::query!(
        "SELECT id, name, cost, category, manual_price, sort_order, created_at, updated_at \
         FROM pricing_catalog ORDER BY sort_order, name"
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows.into_iter().map(|r| PricingCatalogItem {
        id: r.id,
        name: r.name,
        cost: r.cost,
        category: r.category,
        manual_price: r.manual_price,
        sort_order: r.sort_order,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect()))
}

async fn create_item(
    State(state): State<AppState>,
    Json(body): Json<CreatePricingItem>,
) -> Result<(StatusCode, Json<PricingCatalogItem>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }
    if body.category.trim().is_empty() {
        return Err(AppError::BadRequest("Category is required".into()));
    }
    let id = format!("pc-{}", &Uuid::new_v4().to_string().replace('-', "")[..12]);
    let cost = body.cost.unwrap_or(0.0);
    let manual_price = body.manual_price.unwrap_or(false);

    // If no sort_order provided, place at the end.
    let sort_order = match body.sort_order {
        Some(v) => v,
        None => {
            let max: Option<i32> = sqlx::query_scalar!("SELECT MAX(sort_order) FROM pricing_catalog")
                .fetch_one(&state.pool)
                .await?;
            max.unwrap_or(-1) + 1
        }
    };
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query!(
        "INSERT INTO pricing_catalog (id, name, cost, category, manual_price, sort_order, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
        id, body.name, cost, body.category, manual_price, sort_order, now
    )
    .execute(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(PricingCatalogItem {
        id, name: body.name, cost, category: body.category,
        manual_price, sort_order, created_at: now.clone(), updated_at: now,
    })))
}

async fn update_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePricingItem>,
) -> Result<StatusCode, AppError> {
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(v) = &body.name {
        sqlx::query!("UPDATE pricing_catalog SET name = $1, updated_at = $2 WHERE id = $3", v, now, id)
            .execute(&state.pool).await?;
    }
    if let Some(v) = body.cost {
        sqlx::query!("UPDATE pricing_catalog SET cost = $1, updated_at = $2 WHERE id = $3", v, now, id)
            .execute(&state.pool).await?;
    }
    if let Some(v) = &body.category {
        sqlx::query!("UPDATE pricing_catalog SET category = $1, updated_at = $2 WHERE id = $3", v, now, id)
            .execute(&state.pool).await?;
    }
    if let Some(v) = body.manual_price {
        sqlx::query!("UPDATE pricing_catalog SET manual_price = $1, updated_at = $2 WHERE id = $3", v, now, id)
            .execute(&state.pool).await?;
    }
    if let Some(v) = body.sort_order {
        sqlx::query!("UPDATE pricing_catalog SET sort_order = $1, updated_at = $2 WHERE id = $3", v, now, id)
            .execute(&state.pool).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM pricing_catalog WHERE id = $1", id)
        .execute(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
