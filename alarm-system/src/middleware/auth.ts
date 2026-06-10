import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

/**
 * JWT(RS256) 인증 미들웨어 팩토리. alarmRoutes 의 인증 로직과 동일 규약을 재사용한다.
 * payload 의 userId 또는 sub 를 req.userId 로 주입한다.
 */
export function createAuthMiddleware(jwtPublicKey: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ status: 401, error: 'UNAUTHORIZED', message: 'Authorization token is required.' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    try {
      const decoded = jwt.verify(token, jwtPublicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
      const userId = decoded.userId || decoded.sub;
      if (!userId) {
        return res.status(401).json({ status: 401, error: 'UNAUTHORIZED', message: 'Invalid JWT payload.' });
      }
      req.userId = Number(userId);
      next();
    } catch (error) {
      console.error('[Auth Middleware] JWT verification failed:', error);
      return res.status(401).json({ status: 401, error: 'UNAUTHORIZED', message: 'Token is invalid or expired.' });
    }
  };
}
