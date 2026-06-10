import { Router, Response } from 'express';
import { Pool } from 'pg';
import { createAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { AvailableTimeService } from '../services/availableTimeService';
import { PriorityTaskService } from '../services/priorityTaskService';
import { AppError, Errors } from '../errors/errorCodes';

/**
 * 소요시간/가용시간 API.
 *  - POST   /api/tasks                       소요시간 검증 + 가용시간 사전검증 후 생성
 *  - PATCH  /api/tasks/:id/complete          조기완료 환급 + 완료 처리
 *  - GET    /api/users/:id/available-time     가용시간 현황
 *  - PUT    /api/users/:id/available-time     가용시간 설정
 * 모든 라우트 JWT 인증, /users/:id 는 토큰 userId 와 일치(IDOR 방지).
 */
export function createTaskTimeRouter(
  pool: Pool,
  jwtPublicKey: string,
  timeZone = 'Asia/Seoul',
  priority?: PriorityTaskService
): Router {
  const router = Router();
  const auth = createAuthMiddleware(jwtPublicKey);
  const service = new AvailableTimeService(pool, timeZone);

  const send = (res: Response, e: unknown) => {
    if (e instanceof AppError) return res.status(e.status).json(e.toJSON());
    console.error('[TaskTime] unexpected error:', e);
    return res.status(500).json({ status: 500, error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다.' });
  };

  const requireSelf = (req: AuthenticatedRequest, res: Response): number | null => {
    const pathId = Number(req.params.id);
    if (Number.isNaN(pathId) || pathId !== req.userId) {
      res.status(403).json(Errors.forbidden().toJSON());
      return null;
    }
    return pathId;
  };

  // POST /api/tasks
  router.post('/tasks', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, estimated_duration, is_priority } = req.body ?? {};
      if (typeof title !== 'string' || title.trim() === '') {
        return send(res, Errors.validation('title 은 필수입니다.'));
      }
      const task = await service.reserveAndCreateTask(req.userId!, {
        title: title.trim(),
        estimatedDuration: Number(estimated_duration),
        isPriority: Boolean(is_priority),
      });
      if (is_priority) await priority?.invalidate(req.userId!); // 최우선 생성 → 캐시 무효화
      return res.status(201).json(task);
    } catch (e) {
      return send(res, e);
    }
  });

  // PATCH /api/tasks/:id/complete
  router.patch('/tasks/:id/complete', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = Number(req.params.id);
      if (Number.isNaN(taskId)) return send(res, Errors.validation('taskId 가 올바르지 않습니다.'));
      const { elapsed_time, completed_at } = req.body ?? {};
      const completedAt = completed_at ? new Date(completed_at) : new Date();
      const result = await service.completeTask(req.userId!, taskId, Number(elapsed_time), completedAt);
      await priority?.invalidate(req.userId!); // 완료 → 최우선 슬롯 해제 가능성, 캐시 무효화
      return res.status(200).json(result);
    } catch (e) {
      return send(res, e);
    }
  });

  // GET /api/users/:id/available-time
  router.get('/users/:id/available-time', auth, async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireSelf(req, res);
    if (userId === null) return undefined;
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const snapshot = await service.getAvailability(userId, date);
      return res.status(200).json(snapshot);
    } catch (e) {
      return send(res, e);
    }
  });

  // PUT /api/users/:id/available-time
  router.put('/users/:id/available-time', auth, async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireSelf(req, res);
    if (userId === null) return undefined;
    try {
      const { available_seconds, date } = req.body ?? {};
      const result = await service.setAvailableTime(userId, Number(available_seconds), typeof date === 'string' ? date : undefined);
      return res.status(200).json(result);
    } catch (e) {
      return send(res, e);
    }
  });

  return router;
}
