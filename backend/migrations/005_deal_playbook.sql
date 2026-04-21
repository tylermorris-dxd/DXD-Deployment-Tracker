-- Deal Playbook: add metadata fields for priority, conditions, roles, branch answers

ALTER TABLE subtasks
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'p0',
  ADD COLUMN IF NOT EXISTS condition_key TEXT NOT NULL DEFAULT '';

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS role_tag TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stage_number INT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS branch_answers TEXT NOT NULL DEFAULT '{}';
