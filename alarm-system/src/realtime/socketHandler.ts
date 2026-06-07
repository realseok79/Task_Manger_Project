import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { AlarmEvent, AlarmRecord } from '../types/alarm';

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

export class AlarmSocketHandler {
  private io: Server;
  private dbPool: Pool;
  private jwtPublicKey: string; // RS256 Public Key

  constructor(io: Server, dbPool: Pool, jwtPublicKey: string) {
    this.io = io;
    this.dbPool = dbPool;
    this.jwtPublicKey = jwtPublicKey;
    this.setupMiddleware();
    this.setupConnectionHandler();
  }

  /**
   * Set up connection middleware for Socket.IO that validates the JWT.
   * Leverages RS256 algorithm.
   */
  private setupMiddleware(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];

      if (!token) {
        return next(new Error('Authentication error: Token is required'));
      }

      // Remove Bearer prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

      try {
        const decoded = jwt.verify(cleanToken, this.jwtPublicKey, {
          algorithms: ['RS256'],
        }) as jwt.JwtPayload;

        // Extract user_id or sub from JWT payload
        const userId = decoded.userId || decoded.sub;
        if (!userId) {
          return next(new Error('Authentication error: Invalid payload structure'));
        }

        socket.userId = Number(userId);
        next();
      } catch (err) {
        console.error('[Socket Auth] JWT Verification failed:', err);
        return next(new Error('Authentication error: Invalid signature or expired token'));
      }
    });
  }

  /**
   * Set up connection/disconnection handlers and replay missed notifications.
   */
  private setupConnectionHandler(): void {
    this.io.on('connection', async (socket: AuthenticatedSocket) => {
      const userId = socket.userId;
      if (!userId) {
        socket.disconnect();
        return;
      }

      const userRoom = `user:${userId}`;
      await socket.join(userRoom);
      console.log(`[Socket] User ${userId} connected, joined room ${userRoom}`);

      // Reconnection Replay Buffer: Find all alarms that were not delivered (pending_delivery = true)
      await this.replayPendingAlarms(socket, userId);

      // Emit real-time unread count upon connection
      await this.emitUnreadCount(userId);

      socket.on('disconnect', () => {
        console.log(`[Socket] User ${userId} disconnected`);
      });
    });
  }

  /**
   * Emits an alarm event to a specific user.
   * If the user is offline (not connected) or socket delivery fails,
   * it falls back to database persistence with `pending_delivery = true`.
   */
  public async sendAlarmToUser(userId: number, alarm: Omit<AlarmRecord, 'pending_delivery'> & { deadline: string }): Promise<void> {
    const userRoom = `user:${userId}`;
    const clients = this.io.sockets.adapter.rooms.get(userRoom);
    const isUserConnected = clients && clients.size > 0;

    const alarmEvent: AlarmEvent = {
      type: 'ALARM_TRIGGERED',
      alarm_id: alarm.alarm_id,
      task_id: alarm.task_id,
      user_id: alarm.user_id,
      task_name: alarm.task_name,
      deadline: alarm.deadline,
      triggered_at: alarm.triggered_at.toISOString(),
      is_deferred: alarm.is_deferred,
      deferred_count: alarm.deferred_count,
    };

    if (isUserConnected) {
      try {
        // Emit to the user's isolated room
        this.io.to(userRoom).emit('alarm:triggered', alarmEvent);
        console.log(`[Socket] Alarm emitted successfully to user room ${userRoom} for task ${alarm.task_id}`);

        // Update database: alarm successfully delivered (pending_delivery = false)
        await this.dbPool.query(
          'UPDATE alarms SET pending_delivery = FALSE WHERE alarm_id = $1',
          [alarm.alarm_id]
        );

        // Update the real-time unread count badge
        await this.emitUnreadCount(userId);
      } catch (error) {
        console.error(`[Socket] Failed to emit alarm for user ${userId}. Retaining pending_delivery = true:`, error);
      }
    } else {
      console.log(`[Socket] User ${userId} is offline. Alarm stored in DB with pending_delivery = true`);
      // Since it's offline, the DB row remains pending_delivery = true (which is the default in the DB migration)
    }
  }

  /**
   * Replays any alarms that occurred while the client was disconnected.
   */
  private async replayPendingAlarms(socket: AuthenticatedSocket, userId: number): Promise<void> {
    try {
      const query = `
        SELECT alarm_id, task_id, user_id, task_name, triggered_at, is_deferred, deferred_count, 
               (SELECT deadline FROM tasks WHERE task_id = alarms.task_id) as deadline
        FROM alarms
        WHERE user_id = $1 AND pending_delivery = TRUE
        ORDER BY triggered_at ASC
      `;
      const result = await this.dbPool.query(query, [userId]);

      if (result.rows.length > 0) {
        console.log(`[Socket] Replaying ${result.rows.length} pending alarms for user ${userId}`);
        
        for (const row of result.rows) {
          const alarmEvent: AlarmEvent = {
            type: 'ALARM_TRIGGERED',
            alarm_id: row.alarm_id,
            task_id: row.task_id,
            user_id: row.user_id,
            task_name: row.task_name,
            deadline: row.deadline ? new Date(row.deadline).toISOString() : new Date().toISOString(),
            triggered_at: new Date(row.triggered_at).toISOString(),
            is_deferred: row.is_deferred,
            deferred_count: row.deferred_count,
          };
          
          socket.emit('alarm:triggered', alarmEvent);
        }

        // Batch update all replayed alarms to pending_delivery = false
        const alarmIds = result.rows.map(r => r.alarm_id);
        await this.dbPool.query(
          'UPDATE alarms SET pending_delivery = FALSE WHERE alarm_id = ANY($1::uuid[])',
          [alarmIds]
        );
      }
    } catch (error) {
      console.error(`[Socket] Error replaying pending alarms for user ${userId}:`, error);
    }
  }

  /**
   * Emits the current unread count to the user's room.
   */
  public async emitUnreadCount(userId: number): Promise<void> {
    try {
      const query = 'SELECT COUNT(*)::int as count FROM alarms WHERE user_id = $1 AND read_at IS NULL';
      const result = await this.dbPool.query(query, [userId]);
      const count = result.rows[0]?.count ?? 0;

      this.io.to(`user:${userId}`).emit('alarm:unread_count', { count });
      console.log(`[Socket] Unread count ${count} emitted to user ${userId}`);
    } catch (error) {
      console.error(`[Socket] Error emitting unread count for user ${userId}:`, error);
    }
  }
}
