import { Pool, PoolClient } from 'pg';
import { deriveDisplayStatus, transition, Action } from '../state/taskTransitions';
import { Errors } from '../errors/errorCodes';
import { PriorityTaskService } from './priorityTaskService';

/**
 * PATCH /api/tasks/:id/status — START/PAUSE/RESUME/FINISH 상태 전이.
 * 행을 FOR UPDATE 로 잠그고, displayStatus 파생 → 전이 머신 검증 → timer_status 갱신.
 * FINISH: status=COMPLETED, completed_at, elapsed_time 저장 + (최우선이면) 슬롯 해제 이벤트 + 캐시 무효화.
 */
export class TaskStatusService {
  constructor(private pool: Pool, private priority?: PriorityTaskService) {}

  private async withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(client);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async applyAction(userId: number, taskId: number, action: Action, elapsedTime?: number, now: Date = new Date()) {
    const result = await this.withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT task_id, user_id, status, timer_status, deadline, is_priority, estimated_duration
           FROM tasks WHERE task_id = $1 FOR UPDATE`,
        [taskId]
      );
      const t = rows[0];
      if (!t) throw Errors.taskNotFound();
      if (Number(t.user_id) !== userId) throw Errors.forbidden(); // IDOR

      const overdue = Boolean(t.deadline) && new Date(t.deadline) < now && t.status !== 'COMPLETED';
      const display = deriveDisplayStatus({ businessStatus: t.status, timerStatus: t.timer_status, overdue });

      const tr = transition(display, action);
      if (!tr.valid) throw Errors.invalidTransition(tr.message!);

      if (action === 'FINISH') {
        await client.query(
          `UPDATE tasks
              SET status = 'COMPLETED', timer_status = 'COMPLETED',
                  completed_at = $2, elapsed_time = COALESCE($3, elapsed_time)
            WHERE task_id = $1`,
          [taskId, now.toISOString(), elapsedTime ?? null]
        );
      } else {
        // START/RESUME → RUNNING(타이머 시작 시각 기록), PAUSE → PAUSED
        await client.query(
          `UPDATE tasks
              SET timer_status = $2,
                  timer_started_at = CASE WHEN $2 = 'RUNNING' THEN $3 ELSE timer_started_at END
            WHERE task_id = $1`,
          [taskId, tr.timerStatus, now.toISOString()]
        );
      }

      return {
        task_id: taskId,
        action,
        timer_status: action === 'FINISH' ? 'COMPLETED' : tr.timerStatus,
        status: action === 'FINISH' ? 'COMPLETED' : t.status,
        was_priority: Boolean(t.is_priority),
        priority_slot_released: action === 'FINISH' && Boolean(t.is_priority),
      };
    });

    // 상태 변경 → 캐시 무효화(최우선 완료 시 슬롯 해제 반영). 별도 이벤트 발행 지점.
    if (this.priority) await this.priority.invalidate(userId);
    return result;
  }
}
