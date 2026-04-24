use serde::{Deserialize, Serialize};

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProject {
    pub name: String,
    pub client: Option<String>,
    pub site: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProject {
    pub name: Option<String>,
    pub client: Option<String>,
    pub site: Option<String>,
    pub map_cache: Option<serde_json::Value>,
    pub airspace_cache: Option<serde_json::Value>,
    pub network_cache: Option<serde_json::Value>,
    pub weather_cache: Option<serde_json::Value>,
    pub faa_authorization_required: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePhase {
    pub owner: Option<String>,
    pub unlocked: Option<bool>,
    pub completed_at: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTask {
    pub title: String,
    pub assignee: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTask {
    pub title: Option<String>,
    pub completed: Option<bool>,
    pub notes: Option<String>,
    pub due_date: Option<String>,
    pub assignee: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubtask {
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSubtask {
    pub text: Option<String>,
    pub is_done: Option<bool>,
    pub note: Option<String>,
    pub ot_ordered: Option<String>,
    pub ot_shipped: Option<String>,
    pub ot_eta: Option<String>,
    pub ot_delivered: Option<String>,
    pub ot_received_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContact {
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTeamMember {
    pub name: String,
    pub role: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAdminTask {
    pub title: String,
    pub description: Option<String>,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAdminTask {
    pub title: Option<String>,
    pub description: Option<String>,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub client: String,
    pub site: String,
    pub created_at: String,
    pub total_tasks: i64,
    pub done_tasks: i64,
    pub hubspot_deal_id: Option<String>,
    pub current_stage: Option<i32>,
    pub faa_authorization_required: bool,
    pub faa_auth_started_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFull {
    pub id: String,
    pub name: String,
    pub client: String,
    pub site: String,
    pub created_at: String,
    pub map_cache: Option<String>,
    pub airspace_cache: Option<String>,
    pub network_cache: Option<String>,
    pub weather_cache: Option<String>,
    pub phases: Vec<PhaseFull>,
    pub branch_answers: serde_json::Value,
    pub hubspot_deal_id: Option<String>,
    pub faa_authorization_required: bool,
    pub faa_auth_started_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseFull {
    pub id: String,
    pub project_id: String,
    pub phase_number: i32,
    pub title: String,
    pub color: String,
    pub description: String,
    pub owner: String,
    pub unlocked: bool,
    pub completed_at: Option<String>,
    pub sort_order: i32,
    pub tasks: Vec<TaskFull>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFull {
    pub id: String,
    pub phase_id: String,
    pub project_id: String,
    pub title: String,
    pub completed: bool,
    pub notes: String,
    pub due_date: String,
    pub assignee: String,
    pub is_gate: bool,
    pub is_custom: bool,
    pub track_dates: bool,
    pub has_stakeholders: bool,
    pub has_equipment_picker: bool,
    pub sort_order: i64,
    pub role_tag: String,
    pub stage_number: Option<i32>,
    pub subtasks: Vec<SubtaskRow>,
    pub stakeholder_contacts: Vec<ContactRow>,
    pub attachments: Vec<AttachmentMeta>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskRow {
    pub id: i64,
    pub task_id: String,
    pub sort_index: i32,
    pub text: String,
    pub is_done: bool,
    pub note: String,
    pub ot_ordered: String,
    pub ot_shipped: String,
    pub ot_eta: String,
    pub ot_delivered: String,
    pub ot_received_by: String,
    pub priority: String,
    pub condition_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactRow {
    pub id: i64,
    pub task_id: String,
    pub slot_index: i32,
    pub name: String,
    pub email: String,
    pub phone: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    pub id: String,
    pub task_id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub added_at: String,
    pub added_by: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub id: String,
    pub name: String,
    pub role: String,
    pub email: String,
}

// ── Equipment ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEquipment {
    pub name: String,
    pub serial_number: Option<String>,
    pub faa_reg_number: Option<String>,
    pub status: Option<String>,
    pub operator: Option<String>,
    pub qty: Option<i32>,
    pub notes: Option<String>,
    pub subtask_id: Option<i64>,
    pub date_ordered: Option<String>,
    pub date_received: Option<String>,
    pub group_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEquipment {
    pub name: Option<String>,
    pub serial_number: Option<String>,
    pub faa_reg_number: Option<String>,
    pub status: Option<String>,
    pub operator: Option<String>,
    pub qty: Option<i32>,
    pub notes: Option<String>,
    pub date_ordered: Option<String>,
    pub date_received: Option<String>,
    pub group_name: Option<String>,
    // Reassignment: supply one to move the item; the other is cleared automatically
    pub reassign_project_id: Option<String>,
    pub reassign_section_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentItem {
    pub id: String,
    pub project_id: Option<String>,
    pub section_id: Option<String>,
    pub subtask_id: Option<i64>,
    pub name: String,
    pub serial_number: String,
    pub faa_reg_number: String,
    pub status: String,
    pub operator: String,
    pub qty: i32,
    pub notes: String,
    pub date_ordered: String,
    pub date_received: String,
    pub group_name: String,
    pub created_at: String,
    pub is_virtual: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentSection {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEquipmentSection {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameEquipmentSection {
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub assignee: String,
    pub due_date: String,
    pub priority: String,
    pub status: String,
    pub created_at: String,
}
