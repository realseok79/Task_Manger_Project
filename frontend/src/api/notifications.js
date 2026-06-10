/**
 * 알림 API surface (mock/live 라우팅) + 실시간 구독.
 *
 * 백엔드 알림 스키마(notifications):
 *   { id, task_id, type, overdue_days, message, is_read, is_dismissed,
 *     action_taken, service_date, created_at, read_at }
 *   type ∈ 'OVERDUE_1DAY' | 'OVERDUE_2DAY' | 'DELETE_CONFIRM' | 'INFO'
 */
import client, { USE_MOCK, DEFAULT_USER_ID } from './client';
import { mockApi } from './mock';

/** 목록 + unreadCount + nextCursor(키셋 페이지네이션). */
export async function getNotifications(userId = DEFAULT_USER_ID, { unread = false, cursor = null, limit } = {}) {
  if (USE_MOCK) return mockApi.getNotifications(userId, unread, { cursor, limit: limit ?? 50 });
  const { data } = await client.get('/api/notifications', {
    params: { userId, unread: unread ? 'true' : undefined, cursor: cursor || undefined, limit },
  });
  return data; // { notifications, unreadCount, nextCursor }
}

export async function markNotificationRead(id) {
  if (USE_MOCK) return mockApi.markNotificationRead(id);
  await client.post(`/api/notifications/${id}/read`);
}

export async function dismissNotification(id) {
  if (USE_MOCK) return mockApi.dismissNotification(id);
  await client.post(`/api/notifications/${id}/dismiss`);
}

/** DELETE_CONFIRM 처리: 'COMPLETE'(완료로 처리) | 'DELETE'(삭제). */
export async function resolveDeleteConfirm(taskId, action) {
  if (USE_MOCK) return mockApi.resolveDeleteConfirm(taskId, action);
  if (action === 'COMPLETE') {
    await client.patch(`/api/tasks/${taskId}/status`, { action: 'COMPLETE' });
  } else {
    await client.delete(`/api/tasks/${taskId}`);
  }
}

/**
 * 실시간 구독. 반환값은 cleanup 함수.
 * - VITE_NOTIF_SSE_URL 설정 시: 네이티브 EventSource(SSE) — 무의존성. 서버가
 *   'notification:new' / 'unread_count' 이벤트(JSON)를 보낸다고 가정.
 * - 미설정 시: 폴링 폴백(pollMs 간격으로 재조회) — mock/오프라인에서도 동작.
 * (기존 alarm-system 은 Socket.IO 라, 직접 붙이려면 socket.io-client 어댑터를 추가하면 된다.)
 */
export function subscribeNotifications(userId, { onNew, onUnreadCount, pollMs = 20000 }) {
  const sseUrl = import.meta.env.VITE_NOTIF_SSE_URL;

  if (sseUrl && typeof EventSource !== 'undefined') {
    const es = new EventSource(`${sseUrl}?userId=${userId}`, { withCredentials: true });
    es.addEventListener('notification:new', (e) => {
      try { onNew?.(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    });
    es.addEventListener('unread_count', (e) => {
      try { onUnreadCount?.(JSON.parse(e.data).count); } catch { /* ignore */ }
    });
    return () => es.close();
  }

  // 폴링 폴백: 새 id 를 감지해 onNew, 카운트는 onUnreadCount 로 전달.
  let stopped = false;
  let seen = null; // Set<id> — 첫 조회는 toast 없이 베이스라인만 설정
  const tick = async () => {
    if (stopped) return;
    try {
      const { notifications, unreadCount } = await getNotifications(userId);
      onUnreadCount?.(unreadCount);
      const ids = new Set(notifications.map((n) => n.id));
      if (seen === null) {
        seen = ids; // baseline
      } else {
        for (const n of notifications) {
          if (!seen.has(n.id) && !n.is_read && !n.is_dismissed) onNew?.(n);
        }
        seen = ids;
      }
    } catch { /* 네트워크 일시 오류는 다음 tick 에서 회복 */ }
  };
  const timer = setInterval(tick, pollMs);
  tick(); // 즉시 1회(베이스라인)
  return () => { stopped = true; clearInterval(timer); };
}
