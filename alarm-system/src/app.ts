import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createAlarmRouter } from './routes/alarmRoutes';
import { createNotificationRouter } from './routes/notificationRoutes';
import { AlarmSocketHandler } from './realtime/socketHandler';
import { NotificationDispatcher } from './realtime/notificationDispatcher';
import { OverdueNotificationScheduler } from './queue/overdueNotificationScheduler';
import { registerOverdueSchedule } from './queue/registerOverdueSchedule';
import { NotificationBadgeCache } from './cache/notificationBadgeCache';
import { createRateLimiter } from './middleware/rateLimit';
import { createTaskTimeRouter } from './routes/taskTimeRoutes';
import { createPriorityRouter } from './routes/priorityRoutes';
import { PriorityTaskService } from './services/priorityTaskService';

const app = express();
const httpServer = createServer(app);

// Load Configurations from environment variables
const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sigma_tasks';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Y1lM3rBq58o8Z3FhU8C
xKzZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2
xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7
q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ
5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2
xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9k2xO2xQ1xZ5U1k7q9
k2wIDAQAB
-----END PUBLIC KEY-----`;

app.use(express.json());

// Initialize PostgreSQL Pool
const dbPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test Database Connection
dbPool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] Warning: Failed to connect to PostgreSQL. REST endpoints may fail until configured:', err.message);
  } else {
    console.log('[DB] Connected successfully to PostgreSQL.');
    release();
  }
});

// Initialize Redis Connection for BullMQ
let redisConnection: IORedis | null = null;
let alarmQueue: Queue | null = null;

try {
  redisConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  alarmQueue = new Queue('alarm-scheduler', { connection: redisConnection as any });
  console.log('[Redis] Connected successfully for queue operations.');
} catch (error: any) {
  console.error('[Redis] Warning: Failed to connect to Redis. Scheduler queue will be unavailable:', error.message);
}

// Initialize Socket.IO Server
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for API gateway access
    methods: ['GET', 'POST', 'PATCH'],
  },
});

// Initialize Real-time Socket Handler
const socketHandler = new AlarmSocketHandler(io, dbPool, JWT_PUBLIC_KEY);

// Mount Express API Routes
const alarmRouter = createAlarmRouter(dbPool, socketHandler, JWT_PUBLIC_KEY);
app.use('/api', alarmRouter);

// Overdue(밀린 Task) 알림 시스템: 라우터 + 실시간 디스패처 + 배지 캐시 + 자정 00:05 스케줄러
const badgeCache = redisConnection ? new NotificationBadgeCache(redisConnection) : undefined;
// 조회 API 레이트리밋(초당 10건/유저). Redis 없으면 미적용(통과).
const notifRateLimit = redisConnection ? createRateLimiter(redisConnection, { windowSec: 1, max: 10 }) : undefined;
const notificationDispatcher = new NotificationDispatcher(io, dbPool, badgeCache);
app.use('/api', createNotificationRouter(dbPool, notificationDispatcher, JWT_PUBLIC_KEY, badgeCache, notifRateLimit));

// 소요시간/가용시간: POST /api/tasks, PATCH /api/tasks/:id/complete, GET·PUT /api/users/:id/available-time
const priorityService = new PriorityTaskService(dbPool, redisConnection ?? undefined);
app.use('/api', createTaskTimeRouter(dbPool, JWT_PUBLIC_KEY, 'Asia/Seoul', priorityService));
app.use('/api', createPriorityRouter(dbPool, JWT_PUBLIC_KEY, redisConnection ?? undefined));
if (redisConnection) {
  const overdueScheduler = new OverdueNotificationScheduler(dbPool, notificationDispatcher);
  registerOverdueSchedule(overdueScheduler, redisConnection);
  console.log('[Overdue] Daily 00:05 notification scheduler + badge cache registered.');
} else {
  console.warn('[Overdue] Redis unavailable — daily scheduler & badge cache disabled.');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'SIGMA Alarm System Backend' });
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  httpServer.close(async () => {
    await dbPool.end();
    if (redisConnection) {
      await redisConnection.quit();
    }
    console.log('[Server] Graceful shutdown complete.');
    process.exit(0);
  });
});

// Start Server
httpServer.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚀 SIGMA Task Manager Alarm Backend Server started!`);
  console.log(`🌐 REST API Server URL:  http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server URL: ws://localhost:${PORT}`);
  console.log(`🏥 Health Check URL:     http://localhost:${PORT}/health`);
  console.log('========================================================');
});
