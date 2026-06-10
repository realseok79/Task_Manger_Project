-- ============================================================================
-- 알림 시스템 핵심 쿼리 4종 (PostgreSQL)
-- 파라미터: $1, $2 ... (pg / node-postgres 바인딩)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query A) 오늘 실행할 "밀린 Task" 목록 (자정 배치 스케줄러용)
--   - 미완료(completed_at IS NULL, status 활성) + due_date 가 오늘(00:00) 이전
--   - overdue_days = (오늘 - due_date) 달력 일수
--   - $1 = service_date(오늘, DATE). 대량은 keyset 페이지네이션($2=cursor, $3=limit)
--   주: 실제 tasks 컬럼이 deadline 이면 due_date → deadline 으로 치환.
-- ----------------------------------------------------------------------------
SELECT
    t.id                         AS task_id,
    t.user_id,
    t.title,
    ($1::date - t.due_date::date) AS overdue_days
FROM tasks t
WHERE t.completed_at IS NULL
  AND t.status NOT IN ('COMPLETED', 'ARCHIVED')
  AND t.due_date IS NOT NULL
  AND t.due_date < $1::date           -- 오늘 00:00 이전 = 최소 1일 밀림
  AND t.id > $2                        -- keyset cursor
ORDER BY t.id ASC
LIMIT $3;
-- 인덱스 권장: tasks (status, due_date) 또는 부분 인덱스 (due_date) WHERE completed_at IS NULL


-- ----------------------------------------------------------------------------
-- Query B) 특정 사용자의 읽지 않은 알림 목록 (최신순, 최대 50건)
--   $1 = user_id
--   사용 인덱스: idx_notif_user_unread (부분 인덱스, 정렬 포함)
-- ----------------------------------------------------------------------------
SELECT id, task_id, type, overdue_days, message, created_at
FROM notifications
WHERE user_id = $1
  AND is_read = FALSE
  AND is_dismissed = FALSE
ORDER BY created_at DESC
LIMIT 50;


-- ----------------------------------------------------------------------------
-- Query C) 배지 카운트 (unread_count 만 빠르게)
--   $1 = user_id
--   부분 인덱스(idx_notif_user_unread)로 인덱스-온리 카운트에 가깝게 동작.
--   (실시간 정합이 덜 중요하면 Redis 캐시로 대체 — notificationBadgeCache.ts)
-- ----------------------------------------------------------------------------
SELECT COUNT(*)::int AS unread_count
FROM notifications
WHERE user_id = $1
  AND is_read = FALSE
  AND is_dismissed = FALSE;


-- ----------------------------------------------------------------------------
-- Query D) 자정 배치 멱등 upsert (ON CONFLICT DO UPDATE)
--   $1=task_id $2=user_id $3=type $4=overdue_days $5=message $6=service_date(DATE)
--   - (task_id, service_date) 충돌 시 메시지/일수만 갱신(읽음/닫음 상태는 보존).
--   - (xmax = 0) → 이번에 "삽입"된 행(신규)이면 TRUE. 신규일 때만 실시간 push 한다.
--     (UPDATE 된 행은 xmax != 0 → 중복 알림/중복 토스트 방지)
-- ----------------------------------------------------------------------------
INSERT INTO notifications (task_id, user_id, type, overdue_days, message, service_date)
VALUES ($1, $2, $3::notification_type, $4, $5, $6::date)
ON CONFLICT (task_id, service_date) DO UPDATE
    SET type         = EXCLUDED.type,
        overdue_days = EXCLUDED.overdue_days,
        message      = EXCLUDED.message
RETURNING id, task_id, user_id, type, overdue_days, message, created_at, (xmax = 0) AS inserted;
