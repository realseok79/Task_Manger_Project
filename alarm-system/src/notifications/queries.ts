/**
 * 알림 목록 쿼리 빌더 — 키셋(cursor) 페이지네이션 (T15).
 *
 * created_at DESC 기준 키셋: cursor(직전 페이지 마지막 created_at)보다 "이전" 것을 limit 만큼.
 * OFFSET 대신 키셋을 쓰는 이유: 대량(500+)에서도 안정적 O(limit), 중복/누락 없음.
 */
export interface ListParams {
  userId: number;
  unreadOnly?: boolean;
  cursor?: string | null; // ISO created_at
  limit?: number;
}

export interface BuiltQuery {
  sql: string;
  params: unknown[];
  limit: number; // 클램프된 실제 limit (route 가 nextCursor 판정에 사용)
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export function buildNotificationsListQuery({
  userId,
  unreadOnly = false,
  cursor = null,
  limit = DEFAULT_LIMIT,
}: ListParams): BuiltQuery {
  const lim = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const params: unknown[] = [userId];
  let where = 'user_id = $1 AND is_dismissed = FALSE';
  if (unreadOnly) where += ' AND is_read = FALSE';
  if (cursor) {
    params.push(cursor);
    where += ` AND created_at < $${params.length}`;
  }
  params.push(lim);

  const sql = `SELECT id, task_id, type, overdue_days, message, is_read, is_dismissed,
                      action_taken, service_date, created_at, read_at
                 FROM notifications
                WHERE ${where}
                ORDER BY created_at DESC
                LIMIT $${params.length}`;

  return { sql, params, limit: lim };
}

/** 마지막 페이지면 null, 더 있으면 다음 cursor(마지막 행 created_at). */
export function nextCursorOf(rows: Array<{ created_at: string | Date }>, limit: number): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1].created_at;
  return last instanceof Date ? last.toISOString() : last;
}
