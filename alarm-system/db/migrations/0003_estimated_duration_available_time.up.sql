-- ============================================================================
-- Migration 0003 (UP): 소요시간(estimated_duration) + 가용시간/환급
-- Target: PostgreSQL 13+
-- 주: tasks 테이블이 이미 존재한다고 가정(PK=task_id). 실제 PK 컬럼명이 다르면 맞춰 조정.
-- ============================================================================

BEGIN;

-- ① tasks: 소요시간/경과/완료시각/기준일
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;          -- 초 단위(60~86340)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS elapsed_time       INTEGER;          -- 실제 경과(초)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_date     DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date);
ALTER TABLE tasks ADD CONSTRAINT chk_estimated_duration
  CHECK (estimated_duration IS NULL OR (estimated_duration >= 60 AND estimated_duration <= 86340)) NOT VALID;

-- 가용시간 계산용 인덱스(유저+기준일+상태)
CREATE INDEX IF NOT EXISTS idx_tasks_user_day_status ON tasks (user_id, scheduled_date, status);

-- ② 사용자 일별 가용시간 (날짜별 저장 + 동시성 락 대상)
CREATE TABLE IF NOT EXISTS user_available_time (
  user_id           INTEGER     NOT NULL,
  service_date      DATE        NOT NULL,                 -- KST 기준일
  available_seconds INTEGER     NOT NULL DEFAULT 0 CHECK (available_seconds >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_date)
);

-- ③ 조기완료 환급 원장(감사/표시용)
CREATE TABLE IF NOT EXISTS time_refunds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER     NOT NULL,
  task_id          INTEGER     NOT NULL,
  refunded_seconds INTEGER     NOT NULL CHECK (refunded_seconds > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 당일(KST) 환급 합계 조회 최적화
CREATE INDEX IF NOT EXISTS idx_time_refunds_user_created ON time_refunds (user_id, created_at DESC);

COMMIT;
