use axum::Router;

pub mod attachments;
pub mod equipment;
pub mod hubspot;
pub mod misc;
pub mod pricing;
pub mod projects;
pub mod tasks;
pub mod team;
pub mod tevi;

pub use misc::AppState;

pub fn api_router(state: AppState) -> Router {
    Router::new()
        .merge(projects::router())
        .merge(tasks::router())
        .merge(attachments::router())
        .merge(team::router())
        .merge(equipment::router())
        .merge(hubspot::router())
        .merge(pricing::router())
        .merge(tevi::router())
        .merge(misc::router())
        .with_state(state)
}
