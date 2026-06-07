import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createAlarmRouter } from './routes/alarmRoutes';
import { AlarmSocketHandler } from './realtime/socketHandler';

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
