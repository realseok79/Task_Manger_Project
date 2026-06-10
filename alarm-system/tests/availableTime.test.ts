import { AvailableTimeService } from '../src/services/availableTimeService';
import { AppError } from '../src/errors/errorCodes';

type Handler = [string, any];

/** SQL 부분문자열로 결과를 라우팅하는 mock query (pool.query / client.query 공용). */
function routedQuery(handlers: Handler[]) {
  return jest.fn((sql: string) => {
    for (const [needle, val] of handlers) {
      if (sql.includes(needle)) return Promise.resolve(typeof val === 'function' ? val() : val);
    }
    return Promise.resolve({ rows: [] });
  });
}
function makePool(handlers: Handler[]) {
  const q = routedQuery(handlers);
  const client = { query: q, release: jest.fn() };
  const pool: any = { query: q, connect: jest.fn().mockResolvedValue(client) };
  return { pool, q };
}
const calledWith = (q: jest.Mock, needle: string) => q.mock.calls.some((c) => String(c[0]).includes(needle));

describe('AvailableTimeService', () => {
  // ③ 현황 조회
  describe('getAvailability', () => {
    it('remaining = total - allocated - consumed, can_create_task', async () => {
      const { pool } = makePool([
        ['AS total', { rows: [{ total: 3600 }] }],
        ['AS allocated', { rows: [{ allocated: 1200 }] }],
        ['AS consumed', { rows: [{ consumed: 600 }] }],
        ['AS refunded', { rows: [{ refunded: 300 }] }],
        ['title, estimated_duration, status', { rows: [{ task_id: 1, title: 'x', estimated_duration: 1200, status: 'PENDING' }] }],
      ]);
      const svc = new AvailableTimeService(pool, 'Asia/Seoul');
      const snap = await svc.getAvailability(1, '2026-06-08');
      expect(snap.remaining).toBe(1800);
      expect(snap.can_create_task).toBe(true);
      expect(snap.refunded).toBe(300);
      expect(snap.tasks_breakdown).toHaveLength(1);
    });
  });

  // ① 생성 + 가용시간 사전검증(트랜잭션·FOR UPDATE)
  describe('reserveAndCreateTask', () => {
    it('미입력/0초 → DURATION_REQUIRED (트랜잭션 진입 전)', async () => {
      const { pool } = makePool([]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.reserveAndCreateTask(1, { title: 'A', estimatedDuration: 0 }))
        .rejects.toMatchObject({ code: 'DURATION_REQUIRED', status: 400 });
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('범위 밖(30초) → DURATION_OUT_OF_RANGE', async () => {
      const { pool } = makePool([]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.reserveAndCreateTask(1, { title: 'A', estimatedDuration: 30 }))
        .rejects.toMatchObject({ code: 'DURATION_OUT_OF_RANGE' });
    });

    it('충분 → INSERT + COMMIT, 생성된 task 반환', async () => {
      const { pool, q } = makePool([
        ['available_seconds FROM user_available_time', { rows: [{ available_seconds: 3600 }] }], // 잠금 읽기
        ['AS allocated', { rows: [{ allocated: 1000 }] }],
        ['AS consumed', { rows: [{ consumed: 0 }] }],
        ['INSERT INTO tasks', { rows: [{ task_id: 9, user_id: 1, title: 'A', status: 'PENDING', estimated_duration: 600 }] }],
      ]);
      const svc = new AvailableTimeService(pool);
      const task = await svc.reserveAndCreateTask(1, { title: 'A', estimatedDuration: 600 });
      expect(task.task_id).toBe(9);
      expect(calledWith(q, 'FOR UPDATE')).toBe(true); // 행 잠금
      expect(calledWith(q, 'COMMIT')).toBe(true);
      expect(calledWith(q, 'ROLLBACK')).toBe(false);
    });

    it('부족 → 409 INSUFFICIENT_AVAILABLE_TIME + remaining/requested, ROLLBACK', async () => {
      const { pool, q } = makePool([
        ['available_seconds FROM user_available_time', { rows: [{ available_seconds: 1000 }] }],
        ['AS allocated', { rows: [{ allocated: 900 }] }],
        ['AS consumed', { rows: [{ consumed: 0 }] }],
      ]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.reserveAndCreateTask(1, { title: 'A', estimatedDuration: 600 }))
        .rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_AVAILABLE_TIME', extra: { remaining_seconds: 100, requested_seconds: 600 } });
      expect(calledWith(q, 'ROLLBACK')).toBe(true);
      expect(calledWith(q, 'INSERT INTO tasks')).toBe(false);
    });
  });

  // ② 완료 + 조기완료 환급
  describe('completeTask', () => {
    const lockEarly: Handler = ['WHERE task_id = $1 FOR UPDATE', { rows: [{ task_id: 5, user_id: 1, estimated_duration: 600, elapsed_time: null, status: 'PENDING' }] }];

    it('조기완료(elapsed<estimated) → time_refunds 기록 + refunded_seconds 반환', async () => {
      const { pool, q } = makePool([lockEarly, ['INSERT INTO time_refunds', { rows: [] }], ["UPDATE tasks SET status = 'COMPLETED'", { rows: [] }]]);
      const svc = new AvailableTimeService(pool);
      const r = await svc.completeTask(1, 5, 400);
      expect(r.refunded_seconds).toBe(200);
      expect(calledWith(q, 'INSERT INTO time_refunds')).toBe(true);
      expect(calledWith(q, 'COMMIT')).toBe(true);
    });

    it('정시/초과(elapsed≥estimated) → 환급 없음', async () => {
      const { pool, q } = makePool([lockEarly, ["UPDATE tasks SET status = 'COMPLETED'", { rows: [] }]]);
      const svc = new AvailableTimeService(pool);
      const r = await svc.completeTask(1, 5, 600);
      expect(r.refunded_seconds).toBe(0);
      expect(calledWith(q, 'INSERT INTO time_refunds')).toBe(false);
    });

    it('존재하지 않는 Task → 404 TASK_NOT_FOUND, ROLLBACK', async () => {
      const { pool, q } = makePool([['WHERE task_id = $1 FOR UPDATE', { rows: [] }]]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.completeTask(1, 5, 100)).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' });
      expect(calledWith(q, 'ROLLBACK')).toBe(true);
    });

    it('타인 Task → 403 FORBIDDEN (IDOR), ROLLBACK', async () => {
      const { pool, q } = makePool([['WHERE task_id = $1 FOR UPDATE', { rows: [{ task_id: 5, user_id: 2, estimated_duration: 600, status: 'PENDING' }] }]]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.completeTask(1, 5, 100)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
      expect(calledWith(q, 'ROLLBACK')).toBe(true);
    });

    it('elapsed_time 음수 → INVALID_ELAPSED (트랜잭션 전)', async () => {
      const { pool } = makePool([]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.completeTask(1, 5, -1)).rejects.toMatchObject({ code: 'INVALID_ELAPSED' });
      expect(pool.connect).not.toHaveBeenCalled();
    });
  });

  // ④ 가용시간 설정
  describe('setAvailableTime', () => {
    it('할당된 시간보다 작게 → 400 AVAILABLE_BELOW_ALLOCATED', async () => {
      const { pool, q } = makePool([
        ['available_seconds FROM user_available_time', { rows: [{ available_seconds: 0 }] }],
        ['AS allocated', { rows: [{ allocated: 5000 }] }],
      ]);
      const svc = new AvailableTimeService(pool);
      await expect(svc.setAvailableTime(1, 3000, '2026-06-08'))
        .rejects.toMatchObject({ status: 400, code: 'AVAILABLE_BELOW_ALLOCATED', extra: { allocated_seconds: 5000 } });
      expect(calledWith(q, 'ROLLBACK')).toBe(true);
    });

    it('정상 → upsert(DO UPDATE) + COMMIT', async () => {
      const { pool, q } = makePool([
        ['available_seconds FROM user_available_time', { rows: [{ available_seconds: 0 }] }],
        ['AS allocated', { rows: [{ allocated: 5000 }] }],
      ]);
      const svc = new AvailableTimeService(pool);
      const r = await svc.setAvailableTime(1, 7200, '2026-06-08');
      expect(r.available_seconds).toBe(7200);
      expect(calledWith(q, 'DO UPDATE')).toBe(true);
      expect(calledWith(q, 'COMMIT')).toBe(true);
    });
  });
});
