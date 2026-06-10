-- Migration 0004 (DOWN)
BEGIN;
DROP FUNCTION IF EXISTS purge_expired_refunds();
DROP INDEX IF EXISTS idx_tasks_user_day_active;
DROP INDEX IF EXISTS idx_time_refunds_user_date;
ALTER TABLE time_refunds DROP COLUMN IF EXISTS date;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_timer_status;
ALTER TABLE tasks DROP COLUMN IF EXISTS timer_status;
ALTER TABLE tasks DROP COLUMN IF EXISTS timer_started_at;
COMMIT;
