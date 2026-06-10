import { Pool, PoolClient } from 'pg';
import { toServiceDate } from '../notifications/overdue';
import { Errors, MIN_DURATION_SEC, MAX_DURATION_SEC } from '../errors/errorCodes';

/**
 * 가용시간 계산/검증 서비스.
 *
 * 모델(악용 방지를 위해 명세의 +refund 이중차감 대신 소비 모델 채택):
 *   remaining = total_available − allocated(미완료 예약) − consumed(완료분 실경과, estimated 상한)
 *   - allocated  = Σ estimated_duration  WHERE status IN ('PENDING','SNOOZED')  (≈ ACTIVE/PAUSED)
 *   - consumed   = Σ min(elapsed_time, estimated_duration) WHERE status='COMPLETED'
 *   - refunded   = Σ refunded_seconds (당일 KST, time_refunds) — 감사/표시용
 *   조기완료(elapsed<estimated)는 consumed 가 elapsed 만 잡으므로 (estimated−elapsed) 만큼 자동 환급됨.
 *   취소/삭제(ARCHIVED)는 status 가 active 에서 빠져 allocated 에서 자동 반환됨.
 *
 * 동시성: 생성/완료/설정은 트랜잭션 + (user, day) 행 SELECT ... FOR UPDATE 로 직렬화(race 방지).
 */
const ACTIVE_STATUSES = "('PENDING','SNOOZED')";

export interface AvailabilitySnapshot {
  total_available: number;
  allocated: number;
  consumed: number;
  refunded: number;
  remaining: number;
  can_create_task: boolean;
  tasks_breakdown: Array<{ task_id: number; title: string; estimated_duration: number; status: string }>;
}

export interface CreateTaskInput {
  title: string;
  estimatedDuration: number; // seconds
  isPriority?: boolean;
}

export class AvailableTimeService {
  constructor(private readonly pool: Pool, private readonly timeZone: string = 'Asia/Seoul') {}

  private kstDate(now: Date = new Date()): string {
    return toServiceDate(now, this.timeZone);
  }

  private async withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 트랜잭션 내에서 (user, day) 가용시간 행을 보장 + 잠금하고 total_available 을 읽는다. */
  private async lockAndGetTotal(client: PoolClient, userId: number, date: string): Promise<number> {
    await client.query(
      `INSERT INTO user_available_time (user_id, service_date, available_seconds)
       VALUES ($1, $2, 0) ON CONFLICT (user_id, service_date) DO NOTHING`,
      [userId, date]
    );
    const { rows } = await client.query(
      `SELECT available_seconds FROM user_available_time
        WHERE user_id = $1 AND service_date = $2 FOR UPDATE`,
      [userId, date]
    );
    return rows[0]?.available_seconds ?? 0;
  }

  private async sumAllocated(q: Pool | PoolClient, userId: number, date: string): Promise<number> {
    const { rows } = await q.query(
      `SELECT COALESCE(SUM(estimated_duration), 0)::int AS allocated
         FROM tasks
        WHERE user_id = $1 AND scheduled_date = $2 AND status IN ${ACTIVE_STATUSES}`,
      [userId, date]
    );
    return rows[0]?.allocated ?? 0;
  }

  private async sumConsumed(q: Pool | PoolClient, userId: number, date: string): Promise<number> {
    const { rows } = await q.query(
      `SELECT COALESCE(SUM(LEAST(COALESCE(elapsed_time, 0), estimated_duration)), 0)::int AS consumed
         FROM tasks
        WHERE user_id = $1 AND scheduled_date = $2 AND status = 'COMPLETED'`,
      [userId, date]
    );
    return rows[0]?.consumed ?? 0;
  }

  private async sumRefunded(q: Pool | PoolClient, userId: number, date: string): Promise<number> {
    const { rows } = await q.query(
      `SELECT COALESCE(SUM(refunded_seconds), 0)::int AS refunded
         FROM time_refunds
        WHERE user_id = $1 AND (created_at AT TIME ZONE $2)::date = $3`,
      [userId, this.timeZone, date]
    );
    return rows[0]?.refunded ?? 0;
  }

  /** GET /api/users/:id/available-time */
  async getAvailability(userId: number, date: string = this.kstDate()): Promise<AvailabilitySnapshot> {
    const totalRes = await this.pool.query(
      `SELECT COALESCE(available_seconds, 0)::int AS total
         FROM user_available_time WHERE user_id = $1 AND service_date = $2`,
      [userId, date]
    );
    const total = totalRes.rows[0]?.total ?? 0;
    const allocated = await this.sumAllocated(this.pool, userId, date);
    const consumed = await this.sumConsumed(this.pool, userId, date);
    const refunded = await this.sumRefunded(this.pool, userId, date);
    const breakdownRes = await this.pool.query(
      `SELECT task_id, title, estimated_duration, status
         FROM tasks
        WHERE user_id = $1 AND scheduled_date = $2 AND status IN ${ACTIVE_STATUSES}
        ORDER BY task_id`,
      [userId, date]
    );

    const remaining = total - allocated - consumed;
    return {
      total_available: total,
      allocated,
      consumed,
      refunded,
      remaining,
      can_create_task: remaining > 0,
      tasks_breakdown: breakdownRes.rows,
    };
  }

  /** POST /api/tasks — 소요시간 검증 + 가용시간 사전검증(트랜잭션·FOR UPDATE) 후 생성. */
  async reserveAndCreateTask(userId: number, input: CreateTaskInput, now: Date = new Date()) {
    const dur = input.estimatedDuration;
    if (dur === undefined || dur === null || dur === 0) throw Errors.durationRequired();
    if (!Number.isInteger(dur) || dur < MIN_DURATION_SEC || dur > MAX_DURATION_SEC) throw Errors.durationOutOfRange();

    const date = this.kstDate(now);
    return this.withTx(async (client) => {
      const total = await this.lockAndGetTotal(client, userId, date);
      const allocated = await this.sumAllocated(client, userId, date);
      const consumed = await this.sumConsumed(client, userId, date);
      const remaining = total - allocated - consumed;

      if (dur > remaining) throw Errors.insufficientAvailableTime(remaining, dur);

      // 최우선 과제 단일성 검증: (user, day) advisory lock 으로 직렬화 후 활성 최우선 존재 시 409.
      if (input.isPriority) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`priority:${userId}:${date}`]);
        const ex = await client.query(
          `SELECT task_id AS id, title FROM tasks
            WHERE user_id = $1 AND is_priority = TRUE AND status NOT IN ('COMPLETED','ARCHIVED') AND scheduled_date = $2
            LIMIT 1`,
          [userId, date]
        );
        if (ex.rows[0]) throw Errors.priorityTaskExists({ id: ex.rows[0].id, title: ex.rows[0].title });
      }

      const { rows } = await client.query(
        `INSERT INTO tasks (user_id, title, status, estimated_duration, scheduled_date, is_priority)
         VALUES ($1, $2, 'PENDING', $3, $4, $5)
         RETURNING task_id, user_id, title, status, estimated_duration, scheduled_date, is_priority, created_at`,
        [userId, input.title, dur, date, Boolean(input.isPriority)]
      );
      return rows[0];
    });
  }

  /** PATCH /api/tasks/:id/complete — 조기완료 환급(time_refunds) + 완료 처리(트랜잭션·FOR UPDATE). */
  async completeTask(userId: number, taskId: number, elapsedTime: number, completedAt: Date = new Date()) {
    if (!Number.isInteger(elapsedTime) || elapsedTime < 0) throw Errors.invalidElapsed();

    return this.withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT task_id, user_id, estimated_duration, elapsed_time, status
           FROM tasks WHERE task_id = $1 FOR UPDATE`,
        [taskId]
      );
      const task = rows[0];
      if (!task) throw Errors.taskNotFound();
      if (Number(task.user_id) !== userId) throw Errors.forbidden(); // IDOR 방지

      const estimated = task.estimated_duration ?? 0;
      const refund = estimated - elapsedTime;
      if (refund > 0) {
        // 조기완료: 미사용분 환급 원장 기록(당일 KST 합산은 sumRefunded 가 처리)
        await client.query(
          `INSERT INTO time_refunds (user_id, task_id, refunded_seconds) VALUES ($1, $2, $3)`,
          [userId, taskId, refund]
        );
      }
      await client.query(
        `UPDATE tasks SET status = 'COMPLETED', elapsed_time = $2, completed_at = $3 WHERE task_id = $1`,
        [taskId, elapsedTime, completedAt.toISOString()]
      );
      return { task_id: taskId, status: 'COMPLETED', elapsed_time: elapsedTime, refunded_seconds: Math.max(0, refund) };
    });
  }

  /** PUT /api/users/:id/available-time — 당일 가용시간 설정(이미 할당된 시간보다 작게는 불가). */
  async setAvailableTime(userId: number, availableSeconds: number, date: string = this.kstDate()) {
    if (!Number.isInteger(availableSeconds) || availableSeconds < 0) throw Errors.invalidAvailable();

    return this.withTx(async (client) => {
      await this.lockAndGetTotal(client, userId, date); // 행 보장 + 잠금
      const allocated = await this.sumAllocated(client, userId, date);
      if (availableSeconds < allocated) throw Errors.availableBelowAllocated(allocated);

      await client.query(
        `INSERT INTO user_available_time (user_id, service_date, available_seconds, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, service_date)
         DO UPDATE SET available_seconds = EXCLUDED.available_seconds, updated_at = now()`,
        [userId, date, availableSeconds]
      );
      return { user_id: userId, service_date: date, available_seconds: availableSeconds, allocated };
    });
  }
}
