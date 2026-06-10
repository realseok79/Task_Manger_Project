import { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
import { AuthenticatedRequest } from './auth';

/**
 * Redis 기반 고정 윈도우 레이트리밋 (OWASP A04: Insecure Design / API4 무차별 요청 방어).
 *
 * - 키: rl:{route}:{userId|ip}:{window} → INCR + 최초 1회 EXPIRE. 원자적이고 가볍다.
 * - 한도 초과 시 429 + Retry-After. X-RateLimit-* 헤더 노출.
 * - fail-open: 레이트리밋 인프라(Redis) 장애가 본 서비스를 막지 않도록 통과시키되 에러 로깅.
 *   (가용성 우선. 강한 차단이 필요하면 fail-closed 로 전환 가능)
 */
export interface RateLimitOptions {
  windowSec?: number;
  max?: number;
  keyPrefix?: string;
}

export function createRateLimiter(redis: Redis, opts: RateLimitOptions = {}) {
  const windowSec = opts.windowSec ?? 1; // 기본: 초당
  const max = opts.max ?? 10;            // 기본: 10 req/s/user
  const prefix = opts.keyPrefix ?? 'rl';

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const subject = req.userId ?? req.ip ?? 'anon';
    const route = `${req.method}:${req.baseUrl}${req.path}`;
    const windowId = Math.floor(Date.now() / 1000 / windowSec);
    const key = `${prefix}:${route}:${subject}:${windowId}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));

      if (count > max) {
        res.setHeader('Retry-After', String(windowSec));
        res.status(429).json({
          status: 429,
          error: 'TOO_MANY_REQUESTS',
          message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
        });
        return;
      }
      next();
    } catch (error) {
      // fail-open: 레이트리밋 장애로 정상 트래픽을 막지 않는다.
      console.error('[RateLimit] backend error, fail-open:', error instanceof Error ? error.message : error);
      next();
    }
  };
}

/** 레이트리밋 미들웨어 타입(라우터 주입용). */
export type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
