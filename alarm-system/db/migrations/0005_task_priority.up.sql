-- ============================================================================
-- Migration 0005 (UP): 최우선 과제(is_priority) + 단일성 보장
-- ============================================================================
BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE;

-- 동시성 최종 방어선: 같은 (user, 날짜)에 "활성 최우선 과제"는 최대 1개.
-- 완료/아카이브되면 술어에서 빠져 슬롯이 자동 해제된다. FOR UPDATE/advisory-lock 가 통과해도
-- 두 번째 INSERT 는 이 인덱스의 23505(unique_violation)로 차단 → 409 매핑.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_one_priority_per_day
  ON tasks (user_id, scheduled_date)
  WHERE is_priority = TRUE AND status NOT IN ('COMPLETED', 'ARCHIVED');

-- 최우선 조회 가속(활성만 부분 인덱스)
CREATE INDEX IF NOT EXISTS idx_tasks_priority_active
  ON tasks (user_id, scheduled_date)
  WHERE is_priority = TRUE AND status NOT IN ('COMPLETED', 'ARCHIVED');

COMMIT;
