-- ============================================================================
-- Migration 0004 (UP): 타이머 상태 영속 + 환급 기준일/리텐션 (0003 위에 정제)
-- Target: PostgreSQL 13+
-- 주: tasks/users PK 는 이 프로젝트 기준 INTEGER. UUID 환경이면 컬럼 타입만 치환.
-- ============================================================================

BEGIN;

-- ① tasks: 서버측 타이머 상태(IDLE/RUNNING/PAUSED/OVERTIME/COMPLETED) + 시작시각
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timer_status VARCHAR(20) NOT NULL DEFAULT 'IDLE';
ALTER TABLE tasks ALTER COLUMN elapsed_time SET DEFAULT 0;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_timer_status;
ALTER TABLE tasks ADD CONSTRAINT chk_timer_status
  CHECK (timer_status IN ('IDLE','RUNNING','PAUSED','OVERTIME','COMPLETED'));

-- ② time_refunds: KST 기준일 컬럼(리텐션/일별 합산을 sargable 하게) — 기본값으로 기존 insert 무중단
ALTER TABLE time_refunds ADD COLUMN IF NOT EXISTS date DATE NOT NULL
  DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date);
CREATE INDEX IF NOT EXISTS idx_time_refunds_user_date ON time_refunds (user_id, date);

-- ③ 활성 작업 가용시간 계산 가속: 부분 인덱스(미완료만 색인 → 슬림)
CREATE INDEX IF NOT EXISTS idx_tasks_user_day_active
  ON tasks (user_id, scheduled_date)
  WHERE status NOT IN ('COMPLETED', 'ARCHIVED');

-- ④ 만료 환급 정리(일배치) — KST 자정 기준 전일자 삭제
CREATE OR REPLACE FUNCTION purge_expired_refunds()
RETURNS integer AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM time_refunds WHERE date < (now() AT TIME ZONE 'Asia/Seoul')::date;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;

COMMIT;
