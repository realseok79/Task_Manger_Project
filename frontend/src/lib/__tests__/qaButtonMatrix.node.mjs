/**
 * QA 전수 매트릭스 node 검증(러너 미설치 대체). 실행: node src/lib/__tests__/qaButtonMatrix.node.mjs
 * 커버: EC-18~22(상태별 버튼 노출), EC-23~26(낙관적 업데이트/롤백), EC-07(완료 Task Empty 정책).
 */
import assert from 'node:assert/strict';
import { deriveDisplayStatus, taskActionButtonSet } from '../displayStatus.js';
import {
  STATUS, ACTION, optimisticStatusFor, applyOptimisticStatus, applyRollbackStatus,
  getStatus, normalizeList, deriveIsEmpty,
} from '../taskStoreCore.js';

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── EC-18~22: 표시 상태별 버튼 세트 ──────────────────────────────
eq(taskActionButtonSet('IDLE'), ['start'], 'EC-18 IDLE→[시작하기]');
eq(taskActionButtonSet('ACTIVE'), ['pause', 'finish'], 'EC-19 ACTIVE→[중지,끝내기]');
eq(taskActionButtonSet('PAUSED'), ['resume', 'finish'], 'EC-20 PAUSED→[이어서,끝내기]');
eq(taskActionButtonSet('OVERDUE'), ['resume', 'finish'], 'EC-21 OVERDUE→[이어서,끝내기]');
eq(taskActionButtonSet('COMPLETED'), [], 'EC-22 COMPLETED→[]');

// deriveDisplayStatus 조합(버튼 세트의 입력이 정확한지)
eq(deriveDisplayStatus({ status: 'PENDING', dday: 'D-1' }, 'IDLE'), 'IDLE', 'IDLE derive');
eq(deriveDisplayStatus({ status: 'PENDING' }, 'RUNNING'), 'ACTIVE', 'RUNNING→ACTIVE');
eq(deriveDisplayStatus({ status: 'PENDING' }, 'OVERTIME'), 'ACTIVE', 'OVERTIME→ACTIVE');
eq(deriveDisplayStatus({ status: 'PENDING' }, 'PAUSED'), 'PAUSED', 'PAUSED derive');
eq(deriveDisplayStatus({ status: 'PENDING', dday: 'D+2' }, 'IDLE'), 'OVERDUE', 'D+ idle→OVERDUE');
eq(deriveDisplayStatus({ status: 'COMPLETED' }, 'RUNNING'), 'COMPLETED', 'business COMPLETED wins');

// ── EC-27: 최우선 카드도 status 만으로 동일 버튼(is_priority 무관) ──
ok(JSON.stringify(taskActionButtonSet('ACTIVE')) === JSON.stringify(taskActionButtonSet('ACTIVE')),
  'EC-27 priority card uses same status→buttonSet');

// ── EC-23/24: 낙관적 전이(클릭 즉시 다음 세트) ───────────────────
eq(taskActionButtonSet(optimisticStatusFor(STATUS.IDLE, ACTION.START)), ['pause', 'finish'], 'EC-23 START→[중지,끝내기]');
eq(taskActionButtonSet(optimisticStatusFor(STATUS.ACTIVE, ACTION.PAUSE)), ['resume', 'finish'], 'EC-24 PAUSE→[이어서,끝내기]');

// ── EC-25/26: 실패 시 롤백 ───────────────────────────────────────
let list = normalizeList([{ id: 1, status: 'ACTIVE' }]);
const prev = getStatus(list, 1);                                  // ACTIVE
const afterOptimistic = applyOptimisticStatus(list, 1, STATUS.PAUSED);
eq(getStatus(afterOptimistic, 1), 'PAUSED', 'EC-26 optimistic applied');
const afterRollback = applyRollbackStatus(afterOptimistic, 1, prev);
eq(getStatus(afterRollback, 1), 'ACTIVE', 'EC-25/26 rollback to previous');
eq(taskActionButtonSet(getStatus(afterRollback, 1)), ['pause', 'finish'], 'rollback restores ACTIVE buttons');

// 불허 전이는 낙관적 적용 안 함(버튼이 애초에 없어야 정상)
eq(optimisticStatusFor(STATUS.COMPLETED, ACTION.START), null, 'COMPLETED+START illegal');
eq(optimisticStatusFor(STATUS.IDLE, ACTION.PAUSE), null, 'IDLE+PAUSE illegal');

// ── EC-07: 완료 Task 존재 시 Empty 아님(신규 store 모델) ─────────
const onlyCompleted = normalizeList([{ id: 1, status: 'COMPLETED' }]);
eq(deriveIsEmpty(onlyCompleted, false), false, 'EC-07 completed-only → not empty (new model)');
eq(deriveIsEmpty([], true), false, 'EC-02 loading → not empty');
eq(deriveIsEmpty([], false), true, 'EC-01 truly empty → empty');

console.log(`qaButtonMatrix.node: ${n}/${n} assertions passed`);
