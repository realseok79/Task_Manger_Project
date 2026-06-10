-- ============================================================================
-- Migration 0002 (UP): 보안 감사 로그 + 알림 보존기간(리텐션)
-- Target: PostgreSQL 13+
-- OWASP A09(Security Logging & Monitoring) / 개인정보 최소화·보존기간
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 보안 감사 로그: 인증/인가/민감 액션의 흔적. 원문 PII 대신 식별자·마스킹 값을 권장.
CREATE TYPE audit_result AS ENUM ('SUCCESS', 'DENY', 'ERROR');

CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id INTEGER,                         -- NULL = 시스템/배치
    action        VARCHAR(64)  NOT NULL,           -- 'NOTIF_LIST' | 'NOTIF_READ' | 'TASK_DELETE' | 'AUTHZ_DENY' | 'BATCH_RUN' ...
    resource_type VARCHAR(32)  NOT NULL,           -- 'notification' | 'task' | 'batch'
    resource_id   VARCHAR(64),
    result        audit_result NOT NULL,
    ip            INET,
    user_agent    TEXT,
    detail        JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- 마스킹된 부가정보(제목 원문 금지)
    request_id    UUID
);

-- 행위자/시간, 액션/시간 기준 조회 + 거부(DENY) 이상탐지용
CREATE INDEX IF NOT EXISTS idx_audit_actor_time  ON audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_log (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_deny ON audit_log (occurred_at DESC) WHERE result = 'DENY';

-- ---- 알림 보존기간(리텐션) ----
-- notifications 는 service_date 로 월별 파티셔닝(0001) → 보존정책 = 오래된 파티션 DETACH/DROP.
-- 예) GDPR/개인정보 최소보존: 90일 경과 파티션 제거(운영은 pg_partman retention 또는 cron).
--   ALTER TABLE notifications DETACH PARTITION notifications_2026_03;
--   DROP TABLE notifications_2026_03;
-- 감사 로그는 보안 사고 추적을 위해 더 길게(예: 365일) 보존 후 파기.

-- 보존 파기 헬퍼(비파티션 환경/감사로그용): 지정 일수 초과 행 삭제.
CREATE OR REPLACE FUNCTION purge_audit_log(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM audit_log WHERE occurred_at < now() - make_interval(days => retention_days);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

COMMIT;
