use axum::Router;

pub mod attachments;
pub mod misc;
pub mod projects;
pub mod tasks;
pub mod team;

pub use misc::AppState;

pub fn api_router(state: AppState) -> Router {
    Router::new()
        .merge(projects::router())
        .merge(tasks::router())
        .merge(attachments::router())
        .merge(team::router())
        .merge(misc::router())
        .with_state(state)
}
