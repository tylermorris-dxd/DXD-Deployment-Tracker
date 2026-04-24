-- Custom equipment sections (not tied to a deal/project)
CREATE TABLE equipment_sections (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Allow equipment to belong to a section instead of a project
ALTER TABLE equipment ADD COLUMN section_id TEXT REFERENCES equipment_sections(id) ON DELETE CASCADE;
ALTER TABLE equipment ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX idx_equipment_section ON equipment(section_id);
