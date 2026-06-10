/**
 * TaskStore 테스트(Jest 산출물 — 현재 프로젝트에 러너 미설치).
 * 순수 코어(lib/taskStoreCore)는 동일 단언을 node 로도 검증한다: lib/__tests__/taskStoreCore.node.mjs
 */
import {
  STATUS, ACTION, CREATE_RESULT,
  canTransition, optimisticStatusFor, normalizeTask, normalizeList,
  deriveIsEmpty, deriveHasPriorityTask, derivePriorityTask,
  applyOptimisticStatus, applyRollbackStatus, getStatus,
  upsertTask, removeTask, classifyCreateError,
} from '../../lib/taskStoreCore';

const task = (over = {}) => normalizeTask({ id: 1, title: 'T', status: 'IDLE', ...over });

describe('transition rules (mirror backend taskTransitions)', () => {
  it('canTransition: START only from IDLE', () => {
    expect(canTransition(STATUS.IDLE, ACTION.START)).toBe(true);
    expect(canTransition(STATUS.ACTIVE, ACTION.START)).toBe(false);
    expect(canTransition(STATUS.COMPLETED, ACTION.START)).toBe(false);
  });
  it('canTransition: RESUME from PAUSED/OVERDUE; FINISH from ACTIVE/PAUSED/OVERDUE', () => {
    expect(canTransition(STATUS.PAUSED, ACTION.RESUME)).toBe(true);
    expect(canTransition(STATUS.OVERDUE, ACTION.RESUME)).toBe(true);
    for (const s of [STATUS.ACTIVE, STATUS.PAUSED, STATUS.OVERDUE]) {
      expect(canTransition(s, ACTION.FINISH)).toBe(true);
    }
  });
  it('optimisticStatusFor maps allowed actions, null for illegal', () => {
    expect(optimisticStatusFor(STATUS.IDLE, ACTION.START)).toBe(STATUS.ACTIVE);
    expect(optimisticStatusFor(STATUS.ACTIVE, ACTION.PAUSE)).toBe(STATUS.PAUSED);
    expect(optimisticStatusFor(STATUS.PAUSED, ACTION.RESUME)).toBe(STATUS.ACTIVE);
    expect(optimisticStatusFor(STATUS.ACTIVE, ACTION.FINISH)).toBe(STATUS.COMPLETED);
    expect(optimisticStatusFor(STATUS.IDLE, ACTION.PAUSE)).toBeNull();
    expect(optimisticStatusFor(STATUS.COMPLETED, ACTION.START)).toBeNull();
  });
});

describe('normalizeTask', () => {
  it('maps server/viewModel shapes; business status → display status', () => {
    expect(normalizeTask({ taskId: 9, title: 'A', status: 'PENDING', estimatedMinutes: 30 }))
      .toMatchObject({ id: '9', status: 'IDLE', estimated_duration: 1800 });
    expect(normalizeTask({ id: 2, status: 'COMPLETED' }).status).toBe('COMPLETED');
    expect(normalizeTask({ id: 3, status: 'PENDING', dday: 'D+2' })).toMatchObject({ status: 'OVERDUE', overdue_days: 2 });
    expect(normalizeTask({ id: 4, isPriority: true }).is_priority).toBe(true);
  });
});

describe('derived selectors', () => {
  it('isEmpty is false while loading (anti-flicker)', () => {
    expect(deriveIsEmpty([], true)).toBe(false);
    expect(deriveIsEmpty([], false)).toBe(true);
    expect(deriveIsEmpty([task()], false)).toBe(false);
  });
  it('hasPriorityTask/priorityTask ignore COMPLETED priority', () => {
    const list = [task({ id: 1 }), task({ id: 2, isPriority: true })];
    expect(deriveHasPriorityTask(list)).toBe(true);
    expect(derivePriorityTask(list).id).toBe('2');
    const done = [task({ id: 2, isPriority: true, status: 'COMPLETED' })];
    expect(deriveHasPriorityTask(done)).toBe(false);
    expect(derivePriorityTask(done)).toBeNull();
  });
});

describe('optimistic update + rollback', () => {
  it('apply then rollback restores previous status', () => {
    const list = [task({ id: 1, status: 'ACTIVE' })];
    const prev = getStatus(list, 1);
    const optimistic = applyOptimisticStatus(list, 1, STATUS.PAUSED);
    expect(getStatus(optimistic, 1)).toBe('PAUSED');
    const rolledBack = applyRollbackStatus(optimistic, 1, prev);
    expect(getStatus(rolledBack, 1)).toBe('ACTIVE');
  });
  it('upsert inserts new and replaces existing; remove drops by id', () => {
    let list = [task({ id: 1 })];
    list = upsertTask(list, task({ id: 2, title: 'New' }));
    expect(list.map((t) => t.id)).toEqual(['2', '1']);
    list = upsertTask(list, task({ id: 1, title: 'Updated' }));
    expect(list.find((t) => t.id === '1').title).toBe('Updated');
    list = removeTask(list, 2);
    expect(list.map((t) => t.id)).toEqual(['1']);
  });
});

describe('classifyCreateError', () => {
  it('maps 409 / PRIORITY_TASK_EXISTS → PRIORITY_EXISTS', () => {
    expect(classifyCreateError({ status: 409 })).toBe(CREATE_RESULT.PRIORITY_EXISTS);
    expect(classifyCreateError({ code: 'PRIORITY_TASK_EXISTS' })).toBe(CREATE_RESULT.PRIORITY_EXISTS);
    expect(classifyCreateError({ response: { data: { error: 'PRIORITY_EXISTS' } } })).toBe(CREATE_RESULT.PRIORITY_EXISTS);
  });
  it('maps insufficient-time codes → INSUFFICIENT_TIME; unknown → null', () => {
    expect(classifyCreateError({ code: 'INSUFFICIENT_AVAILABLE_TIME' })).toBe(CREATE_RESULT.INSUFFICIENT_TIME);
    expect(classifyCreateError({ status: 500 })).toBeNull();
  });
});

describe('normalizeList', () => {
  it('handles non-arrays safely', () => {
    expect(normalizeList(null)).toEqual([]);
    expect(normalizeList([{ id: 1 }]).length).toBe(1);
  });
});
