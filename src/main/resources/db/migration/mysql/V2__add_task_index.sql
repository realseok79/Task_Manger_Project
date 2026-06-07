-- =============================================================================
-- [MySQL 전용] 운영 환경 인덱스 마이그레이션
-- =============================================================================
-- 적용 방법: 운영 스키마는 spring.jpa.hibernate.ddl-auto=validate 로 동작하므로
--           앱이 인덱스를 자동 생성하지 않는다. 이 파일을 DBA가 수동(또는 Flyway 도입 시 자동) 적용한다.
--
-- 주의: dev/H2 환경에서는 Task 엔티티의 @Index 정의로 동일 인덱스가 자동 생성된다.
--       (DB 종속 DDL은 운영용으로만 이 파일에 분리해 둔다 — 공통 개발 규칙 5)
-- =============================================================================

-- 1) 핵심 조회 인덱스: "유저별 + active(PENDING) 상태 + 에너지 필터" 조회가 가장 빈번하다.
--    선두 컬럼 user_id 로 유저 데이터를 즉시 좁히고, status 로 진행중 항목만 남긴 뒤,
--    required_energy 로 에너지 범위를 커버한다. (카디널리티 높은 컬럼을 앞에 배치)
CREATE INDEX idx_task_user_status_energy
    ON tasks (user_id, status, required_energy);

-- 2) 마감 임박 정렬/조회 보조 인덱스: (user_id, deadline) 로 유저별 마감 순 스캔을 가속한다.
CREATE INDEX idx_task_user_deadline
    ON tasks (user_id, deadline);

-- 3) 로그 분석(엔진) 인덱스: 유저별 행동 종류 + 시간순 조회를 커버한다.
CREATE INDEX idx_log_user_action_time
    ON user_activity_logs (user_id, action_type, logged_at);
