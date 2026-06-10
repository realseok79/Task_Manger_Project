import { Router, Response } from 'express';
import { Pool } from 'pg';
import { createAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { NotificationDispatcher } from '../realtime/notificationDispatcher';
import { NotificationBadgeCache } from '../cache/notificationBadgeCache';
import { buildNotificationsListQuery, nextCursorOf } from '../notifications/queries';
import { RateLimitMiddleware } from '../middleware/rateLimit';

const passThrough: RateLimitMiddleware = (_req, _res, next) => next();

/**
 * 밀린 Task 알림 API. 모든 라우트는 JWT(RS256) 인증을 거치며 토큰의 userId 만 신뢰한다.
 *
 * 응답 스키마
 *  - GET  /api/notifications        → { notifications: Notification[], unreadCount: number }
 *      Notification = { id, task_id, type, overdue_days, message, is_read, is_dismissed,
 *                       action_taken, service_date, created_at, read_at }
 *  - GET  /api/notifications/badge  → { unreadCount: number }            (Redis 캐시 read-through)
 *  - POST /api/notifications/:id/read     → { status: 200, message }
 *  - POST /api/notifications/:id/dismiss  → { status: 200, message }
 *  - DELETE /api/tasks/:taskId            → { status: 200, message, taskId }
 *  - 에러: { status, error, message }
 */
export function createNotificationRouter(
  dbPool: Pool,
  dispatcher: NotificationDispatcher,
  jwtPublicKey: string,
  badgeCache?: NotificationBadgeCache,
  rateLimit: RateLimitMiddleware = passThrough
): Router {
  const router = Router();
  const auth = createAuthMiddleware(jwtPublicKey);

  // GET /api/notifications?userId={id}&unread=true&cursor={ISO}&limit={n}  — Query B(키셋 페이지네이션)
  // 순서: 레이트리밋 → 인증 → 핸들러
  router.get('/notifications', rateLimit, auth, async (req: AuthenticatedRequest, res: Response) => {
    const authUserId = req.userId!;
    const queryUserId = req.query.userId !== undefined ? Number(req.query.userId) : authUserId;
    if (Number.isNaN(queryUserId) || queryUserId !== authUserId) {
      return res.status(403).json({ status: 403, error: 'FORBIDDEN', message: '다른 사용자의 알림은 조회할 수 없습니다.' });
    }
    const unreadOnly = req.query.unread === 'true';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;

    try {
      const { sql, params, limit: lim } = buildNotificationsListQuery({ userId: authUserId, unreadOnly, cursor, limit });
      const { rows } = await dbPool.query(sql, params);
      const unreadCount = await dispatcher.countUnread(authUserId);
      return res.status(200).json({
        notifications: rows,
        unreadCount,
        nextCursor: nextCursorOf(rows, lim), // null 이면 마지막 페이지
      });
    } catch (error) {
      console.error('[API] GET /api/notifications failed:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '알림 조회에 실패했습니다.' });
    }
  });

  // GET /api/notifications/badge — Query C(배지). Redis 캐시 read-through(+stampede 방지).
  router.get('/notifications/badge', rateLimit, auth, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    try {
      const unreadCount = badgeCache
        ? await badgeCache.getOrCompute(userId, () => dispatcher.countUnread(userId))
        : await dispatcher.countUnread(userId);
      return res.status(200).json({ unreadCount });
    } catch (error) {
      console.error('[API] GET /api/notifications/badge failed:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '배지 조회에 실패했습니다.' });
    }
  });

  // POST /api/notifications/:id/read
  router.post('/notifications/:id/read', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await dbPool.query(
        `UPDATE notifications
            SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
          WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
      );
      if (!result.rowCount) {
        return res.status(404).json({ status: 404, error: 'NOT_FOUND', message: '알림을 찾을 수 없습니다.' });
      }
      await dispatcher.emitUnreadCount(req.userId!); // write-through 로 캐시 갱신
      return res.status(200).json({ status: 200, message: '알림을 읽음 처리했습니다.' });
    } catch (error) {
      console.error('[API] POST /api/notifications/:id/read failed:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '읽음 처리에 실패했습니다.' });
    }
  });

  // POST /api/notifications/:id/dismiss
  router.post('/notifications/:id/dismiss', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await dbPool.query(
        `UPDATE notifications
            SET is_dismissed = TRUE, dismissed_at = NOW()
          WHERE id = $1 AND user_id = $2 AND is_dismissed = FALSE`,
        [req.params.id, req.userId]
      );
      if (!result.rowCount) {
        return res.status(404).json({ status: 404, error: 'NOT_FOUND', message: '알림을 찾을 수 없습니다.' });
      }
      await dispatcher.emitUnreadCount(req.userId!);
      return res.status(200).json({ status: 200, message: '알림을 닫았습니다.' });
    } catch (error) {
      console.error('[API] POST /api/notifications/:id/dismiss failed:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '알림 닫기에 실패했습니다.' });
    }
  });

  // DELETE /api/tasks/:taskId — "삭제 확인"에서 호출.
  // 되돌릴 수 있도록 soft-delete(status='ARCHIVED') + 관련 알림 dismiss + action_taken='DELETED'.
  router.delete('/tasks/:taskId', auth, async (req: AuthenticatedRequest, res: Response) => {
    const taskId = Number(req.params.taskId);
    if (Number.isNaN(taskId)) {
      return res.status(400).json({ status: 400, error: 'BAD_REQUEST', message: 'taskId 가 올바르지 않습니다.' });
    }
    try {
      const result = await dbPool.query(
        `UPDATE tasks SET status = 'ARCHIVED'
          WHERE id = $1 AND user_id = $2 AND status <> 'ARCHIVED'`,
        [taskId, req.userId]
      );
      if (!result.rowCount) {
        return res.status(404).json({ status: 404, error: 'NOT_FOUND', message: '작업을 찾을 수 없습니다.' });
      }
      await dbPool.query(
        `UPDATE notifications
            SET is_dismissed = TRUE, dismissed_at = NOW(), action_taken = 'DELETED'
          WHERE task_id = $1 AND user_id = $2 AND is_dismissed = FALSE`,
        [taskId, req.userId]
      );
      await dispatcher.emitUnreadCount(req.userId!);
      return res.status(200).json({ status: 200, message: '작업을 삭제(보관)했습니다.', taskId });
    } catch (error) {
      console.error('[API] DELETE /api/tasks/:taskId failed:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '작업 삭제에 실패했습니다.' });
    }
  });

  return router;
}
