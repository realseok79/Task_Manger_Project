/**
 * 카운트다운 타이머 drift 시뮬레이션 (jest.useFakeTimers).
 * 러너: npm i -D vitest 후 `vitest run` (또는 jest).
 *
 * 핵심: setInterval 콜백 시점에 벽시계(clock)를 불규칙하게 전진시켜 throttling 을 재현하고,
 * timerEngine 이 "1초"가 아니라 "실제 경과"를 차감하는지(=drift 보정) 검증한다.
 */
import * as T from '../timerEngine';

describe('CountdownTimer drift (jest.useFakeTimers)', () => {
  let clock; // ms — 테스트가 통제하는 벽시계 진실값
  const now = () => clock;

  beforeEach(() => { jest.useFakeTimers(); clock = 0; });
  afterEach(() => { jest.useRealTimers(); });

  it('1분 타이머: 1초 간격 정상 tick → 정확히 0 도달 (±1s)', () => {
    let t = T.start(T.createTimer('a', 60), now());
    for (let i = 0; i < 60; i++) { clock += 1000; t = T.tick(t, now()); } // 60회 × 1초
    expect(t.remainingSeconds).toBeCloseTo(0, 1);
    expect(t.elapsedSeconds).toBeCloseTo(60, 1);
  });

  it('탭 전환 30초(throttle: 30초 후 1회만 tick) → 1초가 아니라 30초 차감', () => {
    let t = T.start(T.createTimer('a', 100), now());
    clock += 30_000;            // 백그라운드 30초(콜백 억제)
    t = T.tick(t, now());       // 복귀 후 1회 tick
    expect(t.remainingSeconds).toBeCloseTo(70, 2);
    expect(t.status).toBe('RUNNING');
  });

  it('화면 잠금 5분 → applyHiddenGap 으로 정확히 300초 차감', () => {
    let t = T.start(T.createTimer('a', 600), now());
    clock += 300_000;
    t = T.applyHiddenGap(t, 300, now());
    expect(t.remainingSeconds).toBeCloseTo(300, 2);
    expect(t.elapsedSeconds).toBeCloseTo(300, 2);
  });

  it('일시정지 중 시간 경과 → 차감 없음', () => {
    let t = T.start(T.createTimer('a', 100), now());
    clock += 5000; t = T.pause(t, now());        // 5초 후 정지
    const elapsedAtPause = t.elapsedSeconds;
    clock += 120_000; t = T.tick(t, now());      // 정지 상태로 2분 경과 → tick 무시
    expect(t.elapsedSeconds).toBeCloseTo(elapsedAtPause, 3);
    expect(t.status).toBe('PAUSED');
  });

  it('0 도달 직후 완료 → elapsed ≈ estimated, 환급 0', () => {
    let t = T.start(T.createTimer('a', 60), now());
    clock += 60_000; t = T.tick(t, now());
    const done = T.complete(t, now());
    expect(done.elapsedSeconds).toBeCloseTo(60, 1);
    expect(T.refundForCompletion(done)).toBe(0);
  });

  it('overtime: 0 이후 추가 경과 → OVERTIME 유지, elapsed 계속 증가', () => {
    let t = T.start(T.createTimer('a', 60), now());
    clock += 90_000; t = T.tick(t, now());       // 90초(초과 30초)
    expect(t.status).toBe('OVERTIME');
    expect(t.remainingSeconds).toBeLessThan(0);
    expect(t.elapsedSeconds).toBeCloseTo(90, 2);
  });

  it('두 번째 타이머 시작 시 첫 번째 자동 pause', () => {
    let a = T.start(T.createTimer('a', 100), now());
    clock += 10_000;
    a = T.pause(a, now());                         // store.startTimer(b) 가 a 를 pause
    const b = T.start(T.createTimer('b', 100), now());
    expect(a.status).toBe('PAUSED');
    expect(a.elapsedSeconds).toBeCloseTo(10, 2);
    expect(b.status).toBe('RUNNING');
  });
});
