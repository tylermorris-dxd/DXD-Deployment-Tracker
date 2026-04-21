-- Backfill stage_number for tasks that were seeded before the 005 migration.
-- Task titles follow the pattern "Stage N — Description", so extract N from the title.
UPDATE tasks
SET stage_number = CAST(REGEXP_REPLACE(title, '^Stage (\d+).*', '\1') AS INTEGER)
WHERE title ~ '^Stage \d+'
  AND stage_number IS NULL;

-- Backfill role_tag based on stage_number.
UPDATE tasks
SET role_tag = CASE
  WHEN stage_number BETWEEN 1  AND 3  THEN 'capture'
  WHEN stage_number BETWEEN 4  AND 6  THEN 'solutions'
  WHEN stage_number BETWEEN 7  AND 12 THEN 'delivery'
  ELSE ''
END
WHERE stage_number IS NOT NULL
  AND role_tag = '';
