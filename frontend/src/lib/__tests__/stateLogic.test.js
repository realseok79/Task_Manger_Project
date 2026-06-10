/**
 * 상태 로직 단위/상호작용 테스트 (Jest/Vitest).
 * 프론트엔드에 러너가 없으면: npm i -D vitest 후 `vitest run` (또는 jest).
 * 순수 모듈(timerEngine/availability)을 검증하므로 Zustand/Context 없이도 그대로 통과한다.
 */
import * as T from '../timerEngine';
import * as A from '../availability';

describe('timerEngine — drift 보정', () => {
  it('tick 은 1초가 아니라 실제 경과(now−lastTickAt)를 차감한다', () => {
    let t = T.start(T.createTimer('a', 100), 1000);  // lastTickAt=1000
    t = T.tick(t, 1000 + 3200);                       // 3.2초 경과(throttle)
    expect(t.elapsedSeconds).toBeCloseTo(3.2, 3);
    expect(t.remainingSeconds).toBeCloseTo(96.8, 3);
    expect(t.status).toBe('RUNNING');
  });

  it('remaining ≤ 0 이면 OVERTIME 으로 전이', () => {
    let t = T.start(T.createTimer('a', 5), 0);
    t = T.tick(t, 6000); // 6초 경과 > 5
    expect(t.status).toBe('OVERTIME');
    expect(t.remainingSeconds).toBeLessThanOrEqual(0);
  });

  it('pause→resume 는 정지 구간을 경과에서 제외', () => {
    let t = T.start(T.createTimer('a', 100), 0);
    t = T.pause(t, 10_000);   // 10초 진행 후 정지
    expect(t.elapsedSeconds).toBeCloseTo(10, 3);
    t = T.resume(t, 60_000);  // 50초 뒤 재개(정지 구간 제외)
    t = T.tick(t, 61_000);    // 1초 더
    expect(t.elapsedSeconds).toBeCloseTo(11, 2);
  });

  it('visibilitychange catch-up: 숨겨진 동안의 경과를 한 번에 반영', () => {
    let t = T.start(T.createTimer('a', 100), 1000);
    t = T.applyHiddenGap(t, 45, 46_000); // 45초 백그라운드
    expect(t.remainingSeconds).toBeCloseTo(55, 3);
    expect(t.elapsedSeconds).toBeCloseTo(45, 3);
  });

  it('correctDrift 는 실제 경과로 강제 재정합', () => {
    let t = T.start(T.createTimer('a', 100), 0);
    t = T.tick(t, 3000);
    t = T.correctDrift(t, 30); // 외부 진실: 실제 30초
    expect(t.elapsedSeconds).toBe(30);
    expect(t.remainingSeconds).toBe(70);
  });

  it('조기완료 환급 = estimated − elapsed', () => {
    let t = T.start(T.createTimer('a', 600), 0);
    t = T.tick(t, 400_000);       // 400초
    const done = T.complete(t, 400_000);
    expect(done.status).toBe('COMPLETED');
    expect(T.refundForCompletion(done)).toBe(200); // 600 − 400
  });
});

describe('availability — 5 이벤트 + 파생', () => {
  it('remaining = total − allocated + refunded, 레벨 임계값', () => {
    let s = A.initialAvailability(10_000);
    s = A.onCreateTask(s, 6000);      // allocated 6000
    expect(A.deriveAvailability(s).remaining).toBe(4000);
    expect(A.deriveAvailability(s).insufficiencyLevel).toBe('OK');
    s = A.onCreateTask(s, 2500);      // allocated 8500 → remaining 1500 (<20%)
    expect(A.deriveAvailability(s).insufficiencyLevel).toBe('WARNING');
    s = A.onCreateTask(s, 1600);      // remaining -100 → CRITICAL
    expect(A.deriveAvailability(s).insufficiencyLevel).toBe('CRITICAL');
  });

  it('삭제는 allocated 감소, 자정 리셋은 초기화', () => {
    let s = A.onCreateTask(A.initialAvailability(10_000), 6000);
    s = A.onDeleteTask(s, 6000);
    expect(A.computeRemaining(s)).toBe(10_000);
    s = A.onMidnightReset(20_000);
    expect(s).toEqual({ totalAvailable: 20_000, allocated: 0, refunded: 0 });
  });

  it('isInsufficient: 요청이 remaining 초과면 true', () => {
    const s = A.onCreateTask(A.initialAvailability(3600), 3000); // remaining 600
    expect(A.deriveAvailability(s).isInsufficient(900)).toBe(true);
    expect(A.deriveAvailability(s).isInsufficient(600)).toBe(false);
  });
});

describe('상호작용: 조기완료 → 환급 → 가용시간 증가', () => {
  it('생성으로 줄어든 remaining 이 조기완료 환급으로 회복된다', () => {
    // 가용 1시간, 작업(estimated 30분=1800s) 생성
    let avail = A.onCreateTask(A.initialAvailability(3600), 1800);
    expect(A.computeRemaining(avail)).toBe(1800); // 3600 − 1800

    // 타이머: 20분(1200s)만에 조기완료 → 환급 600s
    let t = T.start(T.createTimer('task-1', 1800), 0);
    t = T.tick(t, 1_200_000);
    const done = T.complete(t, 1_200_000);
    const refund = T.refundForCompletion(done); // 1800 − 1200 = 600

    avail = A.onEarlyCompletion(avail, refund);
    // remaining = 3600 − 1800 + 600 = 2400 (순소비 = 실제 elapsed 1200)
    expect(A.computeRemaining(avail)).toBe(2400);
  });
});
