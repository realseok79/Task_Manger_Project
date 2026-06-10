import { Router, Response } from 'express';
import { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { createAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { AppError, Errors } from '../errors/errorCodes';
import { PriorityTaskService } from '../services/priorityTaskService';
import { TaskStatusService } from '../services/taskStatusService';
import { Action } from '../state/taskTransitions';
import { toServiceDate } from '../notifications/overdue';

const ACTIONS: Action[] = ['START', 'PAUSE', 'RESUME', 'FINISH'];

/**
 * 최우선 과제 + Task 상태 전이 API.
 *  - PATCH /api/tasks/:id/status        START/PAUSE/RESUME/FINISH
 *  - GET   /api/tasks/priority?userId=   오늘의 최우선 과제(캐시)
 *  - GET   /api/tasks?userId=&date=      목록 + is_empty + priority_task_id
 *  - PATCH /api/tasks/:id/priority       { is_priority:false } 해제
 */
export function createPriorityRouter(pool: Pool, jwtPublicKey: string, redis?: Redis, timeZone = 'Asia/Seoul') {
  const router = Router();
  const auth = createAuthMiddleware(jwtPublicKey);
  const priority = new PriorityTaskService(pool, redis, timeZone);
  const statusSvc = new TaskStatusService(pool, priority);

  const send = (res: Response, e: unknown) => {
    if (e instanceof AppError) return res.status(e.status).json(e.toJSON());
    console.error('[Priority] unexpected:', e);
    return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다.' });
  };
  const assertSelf = (req: AuthenticatedRequest, res: Response): number | null => {
    const q = req.query.userId !== undefined ? Number(req.query.userId) : req.userId;
    if (Number.isNaN(q as number) || q !== req.userId) { res.status(403).json(Errors.forbidden().toJSON()); return null; }
    return req.userId!;
  };

  // PATCH /api/tasks/:id/status — 상태 전이
  router.patch('/tasks/:id/status', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      if (Number.isNaN(taskId)) return send(res, Errors.validation('taskId 가 올바르지 않습니다.'));
      const { action, elapsed_time } = req.body ?? {};
      if (!ACTIONS.includes(action)) return send(res, Errors.validation("action 은 START|PAUSE|RESUME|FINISH 여야 합니다."));
      const result = await statusSvc.applyAction(req.userId!, taskId, action, elapsed_time != null ? Number(elapsed_time) : undefined);
      return res.status(200).json(result);
    } catch (e) { return send(res, e); }
  });

  // GET /api/tasks/priority — 오늘의 최우선 과제(캐시)
  router.get('/tasks/priority', auth, async (req: AuthenticatedRequest, res: Response) => {
    const userId = assertSelf(req, res);
    if (userId === null) return undefined;
    try {
      const has = await priority.hasPriorityTask(userId);
      const task = has ? await priority.getActivePriority(pool, userId) : null;
      return res.status(200).json({
        has_priority_task: has,
        task: task ? { id: task.id, title: task.title, status: task.status, timer_status: task.timer_status } : null,
      });
    } catch (e) { return send(res, e); }
  });

  // GET /api/tasks — 목록 + is_empty + priority_task_id (Empty State 단일 진실 원천)
  router.get('/tasks', auth, async (req: AuthenticatedRequest, res: Response) => {
    const userId = assertSelf(req, res);
    if (userId === null) return undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : toServiceDate(new Date(), timeZone);
    try {
      const { rows } = await pool.query(
        `SELECT task_id, title, status, timer_status, is_priority, estimated_duration, scheduled_date, deadline
           FROM tasks
          WHERE user_id = $1 AND scheduled_date = $2 AND status <> 'ARCHIVED'
          ORDER BY task_id`,
        [userId, date]
      );
      const priorityRow = rows.find((r) => r.is_priority && r.status !== 'COMPLETED');
      return res.status(200).json({
        tasks: rows,
        is_empty: rows.length === 0,
        priority_task_id: priorityRow ? priorityRow.task_id : null,
      });
    } catch (e) { return send(res, e); }
  });

  // PATCH /api/tasks/:id/priority — 최우선 해제(강등)
  router.patch('/tasks/:id/priority', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      if (Number.isNaN(taskId)) return send(res, Errors.validation('taskId 가 올바르지 않습니다.'));
      if (req.body?.is_priority !== false) return send(res, Errors.validation('is_priority 는 false(해제)만 지원합니다.'));
      await priority.releasePriority(req.userId!, taskId);
      return res.status(200).json({ status: 200, task_id: taskId, is_priority: false, message: '최우선 과제를 해제했습니다.' });
    } catch (e) { return send(res, e); }
  });

  return router;
}
