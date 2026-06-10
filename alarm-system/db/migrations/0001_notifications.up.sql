-- ============================================================================
-- Migration 0001 (UP): notifications 테이블 (밀린 Task 알림)
-- Target: PostgreSQL 13+
--
-- 설계 메모(중요):
--  - 스펙의 UNIQUE(task_id, DATE(created_at)) + PARTITION BY created_at 은 PostgreSQL 에서
--    동시에 성립하지 않는다. 파티션 테이블의 UNIQUE/PK 는 "파티션 키 컬럼"을 반드시 포함해야 하고,
--    파티션 키의 표현식(DATE(created_at))은 그 요건을 만족하지 못한다.
--  - 따라서 명시적 service_date(DATE) 컬럼을 도입해 파티션 키 겸 멱등 키로 사용한다.
--    (배치는 00:05 에 돌고 created_at ≈ service_date. service_date 는 TZ 모호성도 제거한다.)
--  - 같은 날짜는 항상 같은 월 파티션에 속하므로 UNIQUE(task_id, service_date) 가
--    "Task 당 하루 1건"을 정확히 보장한다.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 타입 안전성: 자유 문자열 대신 ENUM
CREATE TYPE notification_type AS ENUM ('OVERDUE_1DAY', 'OVERDUE_2DAY', 'DELETE_CONFIRM', 'INFO');
CREATE TYPE notification_action AS ENUM ('NONE', 'COMPLETED', 'DELETED', 'SNOOZED');

CREATE TABLE notifications (
    id            UUID                 NOT NULL DEFAULT uuid_generate_v4(),
    task_id       INTEGER              NOT NULL,                 -- FK → tasks(id)
    user_id       INTEGER              NOT NULL,                 -- FK → users(id)
    type          notification_type    NOT NULL,
    overdue_days  INTEGER              NOT NULL DEFAULT 0,
    message       TEXT                 NOT NULL,                 -- 한국어 메시지(조사 처리 완료본)
    is_read       BOOLEAN              NOT NULL DEFAULT FALSE,
    is_dismissed  BOOLEAN              NOT NULL DEFAULT FALSE,
    action_taken  notification_action  NOT NULL DEFAULT 'NONE',
    service_date  DATE                 NOT NULL,                 -- 배치 기준일(파티션 키 + 멱등 키)
    created_at    TIMESTAMPTZ          NOT NULL DEFAULT now(),
    read_at       TIMESTAMPTZ,
    dismissed_at  TIMESTAMPTZ,

    -- 파티션 테이블 규칙: PK/UNIQUE 는 파티션 키(service_date)를 포함해야 한다.
    CONSTRAINT pk_notifications        PRIMARY KEY (id, service_date),
    CONSTRAINT uq_notifications_task_day UNIQUE   (task_id, service_date),  -- "하루 1건" 멱등 보장
    CONSTRAINT chk_overdue_days        CHECK (overdue_days >= 0)
    -- 외래키: 파티션 테이블 → 일반 테이블 참조는 PG12+ 지원.
    --        실제 컬럼명이 다르면(예: tasks.task_id) 타깃만 맞추면 된다.
    -- ,CONSTRAINT fk_notifications_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    -- ,CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) PARTITION BY RANGE (service_date);

-- FK 는 환경(실제 tasks/users PK 컬럼)에 맞춰 활성화. ON DELETE CASCADE 로 Task 삭제 시 알림 정리.
ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
-- ALTER TABLE notifications
--     ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ---- 인덱스 (파티션 부모에 생성 → 모든 파티션에 자동 전파) ----
-- 미읽음 목록/배지: 부분 인덱스로 "살아있는 미읽음"만 색인 → 인덱스 슬림 + 인덱스온리 카운트.
CREATE INDEX idx_notif_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE is_read = FALSE AND is_dismissed = FALSE;

-- 전체 히스토리(읽음 포함) 사용자별 최신순.
CREATE INDEX idx_notif_user_created
    ON notifications (user_id, created_at DESC);

-- Task 단위 조회/정리(삭제 확인 등).
CREATE INDEX idx_notif_task ON notifications (task_id);

-- ---- 월별 파티션 (예시 2개 + DEFAULT). 운영은 pg_partman 또는 cron 으로 사전 생성 ----
CREATE TABLE notifications_2026_06 PARTITION OF notifications
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE notifications_2026_07 PARTITION OF notifications
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE notifications_default PARTITION OF notifications DEFAULT;

COMMIT;
