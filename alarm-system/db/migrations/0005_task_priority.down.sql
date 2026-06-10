-- Migration 0005 (DOWN)
BEGIN;
DROP INDEX IF EXISTS idx_tasks_priority_active;
DROP INDEX IF EXISTS uq_tasks_one_priority_per_day;
ALTER TABLE tasks DROP COLUMN IF EXISTS is_priority;
COMMIT;
