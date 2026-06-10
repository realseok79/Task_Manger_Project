import type { Redis } from 'ioredis';

/**
 * 알림 배지(미읽음 카운트) Redis 캐시.
 *
 * [키 구조]    notif:badge:{userId}        (string, 값=정수 카운트)
 * [락 키]      notif:badge:lock:{userId}   (single-flight 락, PX 5s)
 * [TTL]        기본 300s + 0~60s 지터 → 동시 만료(synchronized expiry) 분산
 * [무효화 시점] 새 알림 생성 / 읽음 / 닫음 / Task 삭제 → write-through(set) 또는 invalidate
 * [stampede 방지]
 *    1) 캐시 미스 시 SET NX 락으로 한 요청만 DB 계산(나머지는 잠깐 대기 후 캐시 재시도)
 *    2) TTL 지터로 만료 동기화 방지
 *    3) 음수 캐싱: 카운트 0 도 캐시(빈 사용자에 대한 반복 DB 조회 차단)
 */
export class NotificationBadgeCache {
  private readonly ttlBaseSec = 300;
  private readonly lockTtlMs = 5000;

  constructor(private readonly redis: Redis) {}

  private key(userId: number): string {
    return `notif:badge:${userId}`;
  }
  private lockKey(userId: number): string {
    return `notif:badge:lock:${userId}`;
  }
  private jitterTtl(): number {
    return this.ttlBaseSec + Math.floor(Math.random() * 60);
  }

  /** 캐시 조회. 미스면 null, 히트면 숫자(0 포함 — 음수 캐싱). */
  async get(userId: number): Promise<number | null> {
    const v = await this.redis.get(this.key(userId));
    return v === null ? null : Number(v);
  }

  /** write-through: 계산된 카운트를 지터 TTL 로 저장. */
  async set(userId: number, count: number): Promise<void> {
    await this.redis.set(this.key(userId), String(count), 'EX', this.jitterTtl());
  }

  /** 무효화(다음 조회에서 재계산). write-through 가 가능하면 set 을 더 선호. */
  async invalidate(userId: number): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  /**
   * read-through + stampede 방지.
   * 미스 시 한 요청만 락을 잡고 compute()(DB COUNT) 실행 → 저장. 나머지는 짧게 대기 후 캐시 재시도,
   * 끝내 비면 직접 계산(폴백)하여 가용성을 보장한다.
   */
  async getOrCompute(userId: number, compute: () => Promise<number>): Promise<number> {
    const cached = await this.get(userId);
    if (cached !== null) return cached;

    const token = `${Date.now()}-${Math.random()}`;
    const acquired = await this.redis.set(this.lockKey(userId), token, 'PX', this.lockTtlMs, 'NX');

    if (acquired === 'OK') {
      try {
        const count = await compute();
        await this.set(userId, count);
        return count;
      } finally {
        // 자기 토큰일 때만 해제(다른 워커 락 삭제 방지)
        const current = await this.redis.get(this.lockKey(userId));
        if (current === token) {
          await this.redis.del(this.lockKey(userId));
        }
      }
    }

    // 락 미획득: 선행 계산이 채워주길 잠시 대기
    for (let i = 0; i < 5; i++) {
      await sleep(50);
      const again = await this.get(userId);
      if (again !== null) return again;
    }
    // 폴백: 그래도 비면 직접 계산(캐시는 채우지 않음 — 락 보유자가 채움)
    return compute();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
