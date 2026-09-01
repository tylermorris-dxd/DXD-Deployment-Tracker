use axum::Router;

pub mod attachments;
pub mod claude;
pub mod equipment;
pub mod hubspot;
pub mod misc;
pub mod network;
pub mod oem_specs;
pub mod pricing;
pub mod project_attachments;
pub mod projects;
pub mod signoff_email;
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
        .merge(claude::router())
        .merge(network::router())
        .merge(oem_specs::router())
        .merge(project_attachments::router())
        .merge(signoff_email::router())
        .merge(misc::router())
        .with_state(state)
}
