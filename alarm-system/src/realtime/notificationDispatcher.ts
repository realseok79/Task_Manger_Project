import { Server } from 'socket.io';
import { Pool } from 'pg';
import { NotificationType } from '../notifications/messages';
import { NotificationBadgeCache } from '../cache/notificationBadgeCache';

/**
 * 실시간 전달 레이어 — WebSocket(Socket.IO) 채택.
 *
 * [WebSocket vs SSE — Socket.IO 선택 이유]
 *  1. 이미 이 서비스가 Socket.IO 기반(socketHandler.ts)으로 동작 중 → SSE 추가 시 인증/룸/재연결 이원화.
 *  2. 양방향 필요(읽음 처리/패널 열람 등 클라→서버 신호)라 단방향 SSE보다 적합.
 *  3. 사용자별 룸(`user:{id}`) + @socket.io/redis-adapter 로 다중 인스턴스 수평 확장 용이.
 */

export interface NotificationPayload {
  notification_id: string;
  task_id: number;
  user_id: number;
  type: NotificationType;
  overdue_days: number;
  message: string;
  created_at: string; // ISO 8601
}

export class NotificationDispatcher {
  constructor(
    private io: Server,
    private dbPool: Pool,
    private badgeCache?: NotificationBadgeCache
  ) {}

  /** 새 알림을 해당 사용자 룸으로 push 하고 미읽음 카운트를 갱신한다. */
  public async dispatch(userId: number, notification: NotificationPayload): Promise<void> {
    this.io.to(`user:${userId}`).emit('notification:new', notification);
    await this.emitUnreadCount(userId);
  }

  /** DB 에서 미읽음 수를 계산해 캐시에 write-through 하고 룸으로 emit. */
  public async emitUnreadCount(userId: number): Promise<void> {
    try {
      const count = await this.countUnread(userId);
      if (this.badgeCache) await this.badgeCache.set(userId, count); // write-through(=무효화 시점)
      this.io.to(`user:${userId}`).emit('notification:unread_count', { count });
    } catch (error) {
      console.error(`[NotificationDispatcher] emitUnreadCount failed for user ${userId}:`, error);
    }
  }

  /** 미읽음(읽지 않고 닫지 않은) 알림 수 — Query C. */
  public async countUnread(userId: number): Promise<number> {
    const { rows } = await this.dbPool.query(
      `SELECT COUNT(*)::int AS count
         FROM notifications
        WHERE user_id = $1 AND is_read = FALSE AND is_dismissed = FALSE`,
      [userId]
    );
    return rows[0]?.count ?? 0;
  }
}
