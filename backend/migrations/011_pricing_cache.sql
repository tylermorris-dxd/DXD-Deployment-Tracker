-- Persist Pricing / Quote Builder state per project
ALTER TABLE projects ADD COLUMN pricing_cache TEXT;
