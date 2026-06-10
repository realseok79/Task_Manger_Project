import { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { toServiceDate } from '../notifications/overdue';
import { Errors } from '../errors/errorCodes';

const ACTIVE = "status NOT IN ('COMPLETED', 'ARCHIVED')";

export interface PriorityTask {
  id: number; title: string; status: string; timer_status: string;
}

/**
 * 최우선 과제 단일성 검증 + Redis 캐시.
 *  - 캐시 키: user:{id}:has_priority_task (TTL 300s)
 *  - 무효화: 생성/완료/상태변경/해제 시 즉시 DEL (라우터/서비스가 호출)
 */
export class PriorityTaskService {
  constructor(private pool: Pool, private redis?: Redis, private timeZone = 'Asia/Seoul') {}

  private key(userId: number) { return `user:${userId}:has_priority_task`; }
  private kstDate(now: Date = new Date()) { return toServiceDate(now, this.timeZone); }

  /** 오늘(KST) 활성 최우선 과제 1건(없으면 null). q 에 PoolClient 를 주면 트랜잭션 내에서 동작. */
  async getActivePriority(q: Pool | PoolClient, userId: number, date = this.kstDate()): Promise<PriorityTask | null> {
    const { rows } = await q.query(
      `SELECT task_id AS id, title, status, timer_status
         FROM tasks
        WHERE user_id = $1 AND is_priority = TRUE AND ${ACTIVE} AND scheduled_date = $2
        LIMIT 1`,
      [userId, date]
    );
    return rows[0] ?? null;
  }

  /** read-through 캐시: 활성 최우선 과제 존재 여부(boolean). */
  async hasPriorityTask(userId: number, date = this.kstDate()): Promise<boolean> {
    if (this.redis) {
      const cached = await this.redis.get(this.key(userId));
      if (cached !== null) return cached === '1';
    }
    const exists = (await this.getActivePriority(this.pool, userId, date)) !== null;
    if (this.redis) await this.redis.set(this.key(userId), exists ? '1' : '0', 'EX', 300);
    return exists;
  }

  /** 캐시 즉시 무효화(생성/완료/상태변경/해제 후 호출). */
  async invalidate(userId: number): Promise<void> {
    try { await this.redis?.del(this.key(userId)); } catch (e) { console.error('[Priority] cache invalidate failed:', e); }
  }

  /**
   * 트랜잭션 내 중복 검증. (user, day)별 advisory lock 으로 직렬화 후 활성 최우선 존재 시 409.
   * (부분 UNIQUE 인덱스가 최종 방어선 — INSERT 시 23505 도 409 로 매핑)
   */
  async assertNoActivePriority(client: PoolClient, userId: number, date = this.kstDate()): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`priority:${userId}:${date}`]);
    const existing = await this.getActivePriority(client, userId, date);
    if (existing) throw Errors.priorityTaskExists({ id: existing.id, title: existing.title });
  }

  /** 최우선 과제 해제(일반 Task 로 강등). 캐시 무효화. */
  async releasePriority(userId: number, taskId: number): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE tasks SET is_priority = FALSE WHERE task_id = $1 AND user_id = $2 AND is_priority = TRUE`,
      [taskId, userId]
    );
    if (!rowCount) throw Errors.taskNotFound();
    await this.invalidate(userId);
  }
}
