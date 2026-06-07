import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';
import { AlarmSocketHandler } from '../realtime/socketHandler';

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

/**
 * Creates the router containing all alarm and prioritized task routes.
 */
export function createAlarmRouter(dbPool: Pool, socketHandler: AlarmSocketHandler, jwtPublicKey: string): Router {
  const router = Router();

  // Authentication Middleware: Validates JWT using RS256 algorithm
  const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ status: 401, error: 'UNAUTHORIZED', message: 'Authorization token is required.' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    try {
      const decoded = jwt.verify(token, jwtPublicKey, {
        algorithms: ['RS256'],
      }) as jwt.JwtPayload;

      const userId = decoded.userId || decoded.sub;
      if (!userId) {
        return res.status(401).json({ status: 401, error: 'UNAUTHORIZED', message: 'Invalid JWT payload.' });
      }

      req.userId = Number(userId);
      next();
    } catch (error) {
      console.error('[Auth Middleware] JWT verification failed:', error);
      return res.status(401).json({ status: 401, error: 'UNAUTHORIZED', message: 'Token is invalid or expired.' });
    }
  };

  /**
   * FEATURE 3: DEFERRED TASK PRIORITY ELEVATION
   * GET /api/tasks/today
   * Sort order:
   * 1. Tasks where is_deferred = true AND deferred_count > 0 — sorted by deferred_count DESC.
   * 2. Tasks where deadline is within the next 24 hours — sorted by deadline ASC.
   * 3. All other tasks — sorted by created_at DESC.
   */
  router.get('/tasks/today', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId;

    try {
      const query = `
        SELECT task_id, user_id, title, description, is_deferred, deferred_count, deadline, 
               estimated_minutes, required_energy, importance, status, created_at
        FROM tasks
        WHERE user_id = $1 AND status = 'PENDING'
        ORDER BY
          CASE 
            WHEN is_deferred = TRUE AND deferred_count > 0 THEN 1
            WHEN deadline >= NOW() AND deadline <= NOW() + INTERVAL '24 hours' THEN 2
            ELSE 3
          END ASC,
          CASE WHEN is_deferred = TRUE AND deferred_count > 0 THEN deferred_count END DESC,
          CASE WHEN deadline >= NOW() AND deadline <= NOW() + INTERVAL '24 hours' THEN deadline END ASC,
          created_at DESC;
      `;
      const { rows } = await dbPool.query(query, [userId]);
      return res.status(200).json({ tasks: rows });
    } catch (error) {
      console.error('[API] Error in GET /api/tasks/today:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve today tasks.' });
    }
  });

  /**
   * FEATURE 2: BELL BUTTON — ALARM HISTORY PANEL
   * PATCH /api/alarms/mark-read
   * Marks all unread alarms for the user as read.
   */
  router.patch('/alarms/mark-read', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId;

    try {
      // Bulk update read_at for all unread alarms of the authenticated user
      await dbPool.query(
        'UPDATE alarms SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
        [userId]
      );

      // Trigger socket event to update clients with the new unread count (which is now 0)
      await socketHandler.emitUnreadCount(userId!);

      return res.status(200).json({ status: 200, message: 'All alarms marked as read.' });
    } catch (error) {
      console.error('[API] Error in PATCH /api/alarms/mark-read:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: 'Failed to mark alarms as read.' });
    }
  });

  /**
   * FEATURE 2: BELL BUTTON — ALARM HISTORY PANEL
   * GET /api/alarms
   * Returns unread alarm count and two sections:
   * SECTION A "미뤄진 작업": All tasks where is_deferred = true, sorted by deferred_count DESC, then triggered_at DESC.
   * SECTION B "알림 기록": All other alarm events for the user, ordered by triggered_at DESC.
   */
  router.get('/alarms', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId;

    try {
      // 1. Fetch Section A: tasks where is_deferred = true, joining with alarms to get triggered_at
      const sectionAQuery = `
        SELECT t.task_id, t.user_id, t.title, t.description, t.is_deferred, t.deferred_count, 
               t.deadline, t.estimated_minutes, t.required_energy, t.importance, t.status, t.created_at,
               t.deadline as original_deadline,
               COALESCE(MAX(a.triggered_at), t.created_at) as triggered_at
        FROM tasks t
        LEFT JOIN alarms a ON t.task_id = a.task_id
        WHERE t.user_id = $1 AND t.is_deferred = TRUE AND t.status = 'PENDING'
        GROUP BY t.task_id, t.user_id, t.title, t.description, t.is_deferred, t.deferred_count, t.deadline, t.estimated_minutes, t.required_energy, t.importance, t.status, t.created_at
        ORDER BY t.deferred_count DESC, triggered_at DESC
      `;
      const sectionAResult = await dbPool.query(sectionAQuery, [userId]);

      // 2. Fetch Section B: all other alarms (where is_deferred = false)
      const sectionBQuery = `
        SELECT alarm_id, task_id, user_id, task_name, triggered_at, read_at, is_deferred, deferred_count
        FROM alarms
        WHERE user_id = $1 AND is_deferred = FALSE
        ORDER BY triggered_at DESC
      `;
      const sectionBResult = await dbPool.query(sectionBQuery, [userId]);

      // 3. Count unread alarms
      const unreadCountQuery = `
        SELECT COUNT(*)::int as count 
        FROM alarms 
        WHERE user_id = $1 AND read_at IS NULL
      `;
      const unreadResult = await dbPool.query(unreadCountQuery, [userId]);
      const unreadCount = unreadResult.rows[0]?.count ?? 0;

      return res.status(200).json({
        sectionA: sectionAResult.rows,
        sectionB: sectionBResult.rows,
        unreadCount
      });
    } catch (error) {
      console.error('[API] Error in GET /api/alarms:', error);
      return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve alarms history.' });
    }
  });

  return router;
}
