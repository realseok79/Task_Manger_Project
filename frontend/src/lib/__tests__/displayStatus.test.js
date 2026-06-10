/** displayStatus 파생 + 버튼 세트 매핑 (jest/vitest). 러너 없으면 node 로도 검증 가능(순수). */
import { deriveDisplayStatus, taskActionButtonSet, isOverdue } from '../displayStatus';

describe('deriveDisplayStatus', () => {
  it('business COMPLETED → COMPLETED (run 무관)', () => {
    expect(deriveDisplayStatus({ status: 'COMPLETED' }, 'RUNNING')).toBe('COMPLETED');
  });
  it('run RUNNING/OVERTIME → ACTIVE', () => {
    expect(deriveDisplayStatus({ status: 'PENDING' }, 'RUNNING')).toBe('ACTIVE');
    expect(deriveDisplayStatus({ status: 'PENDING' }, 'OVERTIME')).toBe('ACTIVE');
  });
  it('run PAUSED → PAUSED', () => {
    expect(deriveDisplayStatus({ status: 'PENDING' }, 'PAUSED')).toBe('PAUSED');
  });
  it('IDLE + 기한초과(D+1) → OVERDUE', () => {
    expect(isOverdue('D+1')).toBe(true);
    expect(deriveDisplayStatus({ status: 'PENDING', dday: 'D+1' }, 'IDLE')).toBe('OVERDUE');
  });
  it('IDLE + 기한 여유(D-2) → IDLE', () => {
    expect(deriveDisplayStatus({ status: 'PENDING', dday: 'D-2' }, 'IDLE')).toBe('IDLE');
  });
});

describe('taskActionButtonSet', () => {
  it('COMPLETED → [] (버튼 없음)', () => expect(taskActionButtonSet('COMPLETED')).toEqual([]));
  it('ACTIVE → [중지, 끝내기]', () => expect(taskActionButtonSet('ACTIVE')).toEqual(['pause', 'finish']));
  it('PAUSED → [이어서, 끝내기]', () => expect(taskActionButtonSet('PAUSED')).toEqual(['resume', 'finish']));
  it('OVERDUE → [이어서, 끝내기]', () => expect(taskActionButtonSet('OVERDUE')).toEqual(['resume', 'finish']));
  it('IDLE → [시작]', () => expect(taskActionButtonSet('IDLE')).toEqual(['start']));
});
