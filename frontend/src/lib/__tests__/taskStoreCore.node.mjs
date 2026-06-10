/**
 * taskStoreCore 순수 코어 node 검증(러너 미설치 대체). 실행: node src/lib/__tests__/taskStoreCore.node.mjs
 */
import assert from 'node:assert/strict';
import {
  STATUS, ACTION, CREATE_RESULT,
  canTransition, optimisticStatusFor, normalizeTask, normalizeList,
  deriveIsEmpty, deriveHasPriorityTask, derivePriorityTask,
  applyOptimisticStatus, applyRollbackStatus, getStatus,
  upsertTask, removeTask, classifyCreateError,
} from '../taskStoreCore.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// transitions
ok(canTransition(STATUS.IDLE, ACTION.START), 'START from IDLE');
ok(!canTransition(STATUS.ACTIVE, ACTION.START), 'no START from ACTIVE');
ok(!canTransition(STATUS.COMPLETED, ACTION.START), 'no START from COMPLETED');
ok(canTransition(STATUS.PAUSED, ACTION.RESUME) && canTransition(STATUS.OVERDUE, ACTION.RESUME), 'RESUME from PAUSED/OVERDUE');
for (const s of [STATUS.ACTIVE, STATUS.PAUSED, STATUS.OVERDUE]) ok(canTransition(s, ACTION.FINISH), `FINISH from ${s}`);
eq(optimisticStatusFor(STATUS.IDLE, ACTION.START), STATUS.ACTIVE, 'START→ACTIVE');
eq(optimisticStatusFor(STATUS.ACTIVE, ACTION.PAUSE), STATUS.PAUSED, 'PAUSE→PAUSED');
eq(optimisticStatusFor(STATUS.PAUSED, ACTION.RESUME), STATUS.ACTIVE, 'RESUME→ACTIVE');
eq(optimisticStatusFor(STATUS.ACTIVE, ACTION.FINISH), STATUS.COMPLETED, 'FINISH→COMPLETED');
eq(optimisticStatusFor(STATUS.IDLE, ACTION.PAUSE), null, 'illegal PAUSE→null');
eq(optimisticStatusFor(STATUS.COMPLETED, ACTION.START), null, 'illegal START→null');

// normalize
eq(normalizeTask({ taskId: 9, title: 'A', status: 'PENDING', estimatedMinutes: 30 }).status, 'IDLE', 'PENDING→IDLE');
eq(normalizeTask({ taskId: 9, estimatedMinutes: 30 }).estimated_duration, 1800, 'minutes→seconds');
eq(normalizeTask({ id: 2, status: 'COMPLETED' }).status, 'COMPLETED', 'COMPLETED kept');
eq(normalizeTask({ id: 3, status: 'PENDING', dday: 'D+2' }).status, 'OVERDUE', 'D+ → OVERDUE');
eq(normalizeTask({ id: 3, status: 'PENDING', dday: 'D+2' }).overdue_days, 2, 'overdue_days parsed');
ok(normalizeTask({ id: 4, isPriority: true }).is_priority === true, 'isPriority mapped');
eq(normalizeList(null), [], 'null list → []');

// derived
eq(deriveIsEmpty([], true), false, 'loading hides empty');
eq(deriveIsEmpty([], false), true, 'empty when not loading');
const list = normalizeList([{ id: 1, status: 'IDLE' }, { id: 2, status: 'IDLE', isPriority: true }]);
ok(deriveHasPriorityTask(list), 'hasPriority true');
eq(derivePriorityTask(list).id, '2', 'priorityTask id');
const donePr = normalizeList([{ id: 2, status: 'COMPLETED', isPriority: true }]);
ok(!deriveHasPriorityTask(donePr), 'completed priority ignored');
eq(derivePriorityTask(donePr), null, 'no priorityTask when completed');

// optimistic + rollback
const a0 = normalizeList([{ id: 1, status: 'ACTIVE' }]);
const prev = getStatus(a0, 1);
const a1 = applyOptimisticStatus(a0, 1, STATUS.PAUSED);
eq(getStatus(a1, 1), 'PAUSED', 'optimistic applied');
eq(getStatus(applyRollbackStatus(a1, 1, prev), 1), 'ACTIVE', 'rollback restores');

// upsert/remove
let u = normalizeList([{ id: 1 }]);
u = upsertTask(u, normalizeTask({ id: 2, title: 'New' }));
eq(u.map((t) => t.id), ['2', '1'], 'upsert prepends new');
u = upsertTask(u, normalizeTask({ id: 1, title: 'Updated' }));
eq(u.find((t) => t.id === '1').title, 'Updated', 'upsert replaces');
eq(removeTask(u, 2).map((t) => t.id), ['1'], 'remove by id');

// classify errors
eq(classifyCreateError({ status: 409 }), CREATE_RESULT.PRIORITY_EXISTS, '409→PRIORITY_EXISTS');
eq(classifyCreateError({ code: 'PRIORITY_TASK_EXISTS' }), CREATE_RESULT.PRIORITY_EXISTS, 'code→PRIORITY_EXISTS');
eq(classifyCreateError({ code: 'INSUFFICIENT_AVAILABLE_TIME' }), CREATE_RESULT.INSUFFICIENT_TIME, '→INSUFFICIENT_TIME');
eq(classifyCreateError({ status: 500 }), null, 'unknown→null');

console.log(`taskStoreCore.node: ${n}/${n} assertions passed`);
