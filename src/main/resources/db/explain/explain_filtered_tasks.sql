-- =============================================================================
-- 하드 컨스트레인트 조회의 실행계획 측정 스크립트 (인덱스 전/후 비교용)
-- =============================================================================
-- 대상 쿼리: 특정 유저의 PENDING + 에너지/시간 조건을 만족하는 Task 조회.
-- 측정 포인트: 선두 컬럼 (user_id, status) 가 idx_task_user_status_energy 로 커버되어
--             풀스캔(type=ALL)이 인덱스 레인지 스캔(type=ref/range)으로 바뀌는지 확인한다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- [MySQL] EXPLAIN 사용. type / rows 컬럼을 인덱스 전/후로 비교한다.
-- -----------------------------------------------------------------------------
-- (인덱스 없음 상태를 보려면 먼저: ALTER TABLE tasks DROP INDEX idx_task_user_status_energy;)
EXPLAIN
SELECT *
FROM tasks
WHERE user_id = 1
  AND status = 'PENDING'
  AND estimated_minutes <= 30
ORDER BY deadline;
-- (측정 후 인덱스 복구: CREATE INDEX idx_task_user_status_energy ON tasks (user_id, status, required_energy);)


-- -----------------------------------------------------------------------------
-- [H2] EXPLAIN ANALYZE 사용. 실제 실행 후 스캔 방식/예상 행수를 출력한다.
-- -----------------------------------------------------------------------------
EXPLAIN ANALYZE
SELECT *
FROM tasks
WHERE user_id = 1
  AND status = 'PENDING'
  AND estimated_minutes <= 30
ORDER BY deadline;
