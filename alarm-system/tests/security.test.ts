import { sanitizeTitle } from '../src/lib/sanitize';
import { maskUserId, maskTitle, maskedTaskRef } from '../src/lib/mask';
import { generateNotificationMessage } from '../src/notifications/messages';
import { createRateLimiter } from '../src/middleware/rateLimit';

describe('보안', () => {
  // ── ② XSS sanitization ─────────────────────────────────────
  describe('sanitizeTitle (저장형 XSS 방어)', () => {
    it('script 태그/꺾쇠 제거', () => {
      const out = sanitizeTitle('<script>alert(1)</script>운동');
      expect(out).not.toMatch(/[<>]/);
      expect(out).not.toContain('<script>');
      expect(out).toContain('운동');
    });

    it('img onerror 같은 태그도 제거', () => {
      expect(sanitizeTitle('<img src=x onerror=alert(1)>책')).toBe('책');
    });

    it('제어문자 제거 + 길이 제한', () => {
      expect(sanitizeTitle('a\tb\nc')).toBe('abc'); // 탭/개행(제어문자) 제거
      expect(sanitizeTitle('가'.repeat(300)).length).toBe(255);
    });

    it('정상 제목은 그대로 보존(조사 메시지 회귀 없음)', () => {
      expect(sanitizeTitle('운동')).toBe('운동');
      expect(generateNotificationMessage('운동', 1)).toBe('운동이 하루 미뤄졌습니다.');
    });

    it('악성 제목이 메시지에 박혀도 태그가 남지 않는다', () => {
      const msg = generateNotificationMessage('<b>운동</b>', 1);
      expect(msg).not.toMatch(/[<>]/);
      expect(msg).toContain('운동');
    });
  });

  // ── ④ 로그 PII 마스킹 ───────────────────────────────────────
  describe('PII 마스킹', () => {
    it('maskUserId', () => {
      expect(maskUserId(1)).toBe('*');
      expect(maskUserId(42)).toBe('4*');
      expect(maskUserId(12345)).toBe('1***5');
    });
    it('maskTitle: 첫 글자 + 길이만', () => {
      expect(maskTitle('기말 보고서')).toBe('기…(6자)');
      expect(maskTitle('')).toBe('∅');
    });
    it('maskedTaskRef 합성', () => {
      expect(maskedTaskRef(12345, '운동하기')).toBe('user=1***5 task="운…(4자)"');
    });
  });

  // ── ③ Rate Limiting ────────────────────────────────────────
  describe('createRateLimiter (Redis 고정 윈도우)', () => {
    const makeRes = () => {
      const res: any = {};
      res.setHeader = jest.fn();
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };
    const req: any = { method: 'GET', baseUrl: '/api', path: '/notifications', userId: 1 };

    it('한도 이내 → next 호출, 429 없음, 헤더 노출', async () => {
      const redis: any = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1) };
      const limiter = createRateLimiter(redis, { max: 2, windowSec: 1 });
      const res = makeRes();
      const next = jest.fn();
      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '2');
      expect(redis.expire).toHaveBeenCalled(); // 최초 1회 EXPIRE
    });

    it('한도 초과 → 429 + Retry-After, next 미호출', async () => {
      const redis: any = { incr: jest.fn().mockResolvedValue(3), expire: jest.fn() };
      const limiter = createRateLimiter(redis, { max: 2, windowSec: 1 });
      const res = makeRes();
      const next = jest.fn();
      await limiter(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
      expect(next).not.toHaveBeenCalled();
    });

    it('Redis 장애 → fail-open(next 통과)', async () => {
      const redis: any = { incr: jest.fn().mockRejectedValue(new Error('down')), expire: jest.fn() };
      const limiter = createRateLimiter(redis, { max: 2, windowSec: 1 });
      const res = makeRes();
      const next = jest.fn();
      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
