-- Persist Ops Planner state per project
ALTER TABLE projects ADD COLUMN ops_plan TEXT;
