import { deriveDisplayStatus, transition } from '../src/state/taskTransitions';
import { PriorityTaskService } from '../src/services/priorityTaskService';
import { TaskStatusService } from '../src/services/taskStatusService';
import { AppError } from '../src/errors/errorCodes';

describe('taskTransitions (pure state machine)', () => {
  describe('deriveDisplayStatus', () => {
    it('COMPLETED business/timer → COMPLETED', () => {
      expect(deriveDisplayStatus({ businessStatus: 'COMPLETED', timerStatus: 'IDLE', overdue: false })).toBe('COMPLETED');
      expect(deriveDisplayStatus({ businessStatus: 'PENDING', timerStatus: 'COMPLETED', overdue: false })).toBe('COMPLETED');
    });
    it('RUNNING/OVERTIME → ACTIVE', () => {
      expect(deriveDisplayStatus({ businessStatus: 'PENDING', timerStatus: 'RUNNING', overdue: false })).toBe('ACTIVE');
      expect(deriveDisplayStatus({ businessStatus: 'PENDING', timerStatus: 'OVERTIME', overdue: true })).toBe('ACTIVE');
    });
    it('PAUSED → PAUSED', () => {
      expect(deriveDisplayStatus({ businessStatus: 'PENDING', timerStatus: 'PAUSED', overdue: false })).toBe('PAUSED');
    });
    it('IDLE + overdue → OVERDUE, else IDLE', () => {
      expect(deriveDisplayStatus({ businessStatus: 'PENDING', timerStatus: 'IDLE', overdue: true })).toBe('OVERDUE');
      expect(deriveDisplayStatus({ businessStatus: 'PENDING', timerStatus: 'IDLE', overdue: false })).toBe('IDLE');
    });
  });

  describe('transition', () => {
    it('START: IDLE → RUNNING', () => {
      expect(transition('IDLE', 'START')).toEqual({ valid: true, timerStatus: 'RUNNING', businessStatus: undefined });
    });
    it('PAUSE: ACTIVE → PAUSED', () => {
      expect(transition('ACTIVE', 'PAUSE')).toMatchObject({ valid: true, timerStatus: 'PAUSED' });
    });
    it('RESUME: PAUSED/OVERDUE → RUNNING', () => {
      expect(transition('PAUSED', 'RESUME')).toMatchObject({ valid: true, timerStatus: 'RUNNING' });
      expect(transition('OVERDUE', 'RESUME')).toMatchObject({ valid: true, timerStatus: 'RUNNING' });
    });
    it('FINISH: ACTIVE/PAUSED/OVERDUE → COMPLETED', () => {
      for (const s of ['ACTIVE', 'PAUSED', 'OVERDUE'] as const) {
        expect(transition(s, 'FINISH')).toMatchObject({ valid: true, timerStatus: 'COMPLETED', businessStatus: 'COMPLETED' });
      }
    });
    it('COMPLETED → START invalid with spec message', () => {
      const r = transition('COMPLETED', 'START');
      expect(r.valid).toBe(false);
      expect(r.message).toBe('완료된 Task는 다시 시작할 수 없습니다.');
    });
    it('IDLE → PAUSE invalid with spec message', () => {
      const r = transition('IDLE', 'PAUSE');
      expect(r.valid).toBe(false);
      expect(r.message).toBe('시작하지 않은 Task는 일시정지할 수 없습니다.');
    });
    it('IDLE → RESUME / ACTIVE → START invalid', () => {
      expect(transition('IDLE', 'RESUME').valid).toBe(false);
      expect(transition('ACTIVE', 'START').valid).toBe(false);
    });
  });
});

describe('PriorityTaskService', () => {
  const makePool = (rows: any[] = []) => ({ query: jest.fn().mockResolvedValue({ rows, rowCount: rows.length }) });
  const makeRedis = () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() });

  it('hasPriorityTask: cache hit short-circuits DB', async () => {
    const pool = makePool([]);
    const redis = makeRedis();
    redis.get.mockResolvedValue('1');
    const svc = new PriorityTaskService(pool as any, redis as any);
    expect(await svc.hasPriorityTask(7, '2026-06-09')).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('hasPriorityTask: cache miss reads DB and back-fills (EX 300)', async () => {
    const pool = makePool([{ id: 1, title: 'A', status: 'PENDING', timer_status: 'IDLE' }]);
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);
    const svc = new PriorityTaskService(pool as any, redis as any);
    expect(await svc.hasPriorityTask(7, '2026-06-09')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('user:7:has_priority_task', '1', 'EX', 300);
  });

  it('assertNoActivePriority: throws 409 PRIORITY_TASK_EXISTS with existing_task', async () => {
    const client = makePool();
    client.query
      .mockResolvedValueOnce({ rows: [] })                                            // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: 42, title: '기존 최우선', status: 'PENDING', timer_status: 'IDLE' }] });
    const svc = new PriorityTaskService({} as any);
    await expect(svc.assertNoActivePriority(client as any, 7, '2026-06-09')).rejects.toMatchObject({
      status: 409, code: 'PRIORITY_TASK_EXISTS', extra: { existing_task: { id: 42, title: '기존 최우선' } },
    });
  });

  it('releasePriority: 404 when nothing released, invalidates on success', async () => {
    const okPool = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const redis = makeRedis();
    const svc = new PriorityTaskService(okPool as any, redis as any);
    await svc.releasePriority(7, 9);
    expect(redis.del).toHaveBeenCalledWith('user:7:has_priority_task');

    const noPool = { query: jest.fn().mockResolvedValue({ rowCount: 0 }) };
    const svc2 = new PriorityTaskService(noPool as any);
    await expect(svc2.releasePriority(7, 9)).rejects.toMatchObject({ status: 404 });
  });
});

describe('TaskStatusService.applyAction', () => {
  // FOR UPDATE 행을 돌려주는 트랜잭션 클라이언트 모킹
  const makeTxPool = (taskRow: any) => {
    const client = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (/FOR UPDATE/.test(sql)) return Promise.resolve({ rows: [taskRow] });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }),
      release: jest.fn(),
    };
    return { pool: { connect: jest.fn().mockResolvedValue(client) }, client };
  };

  it('START on IDLE → RUNNING + cache invalidate', async () => {
    const { pool, client } = makeTxPool({ task_id: 5, user_id: 7, status: 'PENDING', timer_status: 'IDLE', deadline: null, is_priority: true });
    const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    const svc = new TaskStatusService(pool as any, new PriorityTaskService(pool as any, redis as any));
    const r = await svc.applyAction(7, 5, 'START');
    expect(r).toMatchObject({ task_id: 5, timer_status: 'RUNNING' });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(redis.del).toHaveBeenCalledWith('user:7:has_priority_task');
  });

  it('FINISH on ACTIVE → COMPLETED + priority slot released', async () => {
    const { pool } = makeTxPool({ task_id: 5, user_id: 7, status: 'PENDING', timer_status: 'RUNNING', deadline: null, is_priority: true });
    const svc = new TaskStatusService(pool as any);
    const r = await svc.applyAction(7, 5, 'FINISH', 120);
    expect(r).toMatchObject({ status: 'COMPLETED', timer_status: 'COMPLETED', priority_slot_released: true });
  });

  it('START on COMPLETED → 400 INVALID_TRANSITION, rolls back', async () => {
    const { pool, client } = makeTxPool({ task_id: 5, user_id: 7, status: 'COMPLETED', timer_status: 'COMPLETED', deadline: null, is_priority: false });
    const svc = new TaskStatusService(pool as any);
    await expect(svc.applyAction(7, 5, 'START')).rejects.toMatchObject({ status: 400, code: 'INVALID_TRANSITION' });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('foreign user → 403 forbidden (IDOR)', async () => {
    const { pool } = makeTxPool({ task_id: 5, user_id: 999, status: 'PENDING', timer_status: 'IDLE', deadline: null, is_priority: false });
    const svc = new TaskStatusService(pool as any);
    await expect(svc.applyAction(7, 5, 'START')).rejects.toBeInstanceOf(AppError);
    await expect(svc.applyAction(7, 5, 'START')).rejects.toMatchObject({ status: 403 });
  });
});
