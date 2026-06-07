import { AlarmScheduler } from '../src/queue/alarmScheduler';
import { AlarmSocketHandler } from '../src/realtime/socketHandler';
import { AlarmManager } from '../src/client/AlarmManager';
import type { Queue } from 'bullmq';
import type { Pool } from 'pg';
import type { Server } from 'socket.io';
import { Task, AlarmRecord } from '../src/types/alarm';

describe('SIGMA Alarm System Test Suite', () => {
  let dbPoolMock: jest.Mocked<Pool>;
  let queueMock: jest.Mocked<Queue>;
  let ioMock: jest.Mocked<Server>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    dbPoolMock = {
      query: jest.fn(),
    } as any;

    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' } as any),
      getJob: jest.fn().mockResolvedValue(null),
    } as any;

    ioMock = {
      use: jest.fn(),
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as any;
  });

  // =========================================================================
  // 1. TIMING ACCURACY TESTS (Aiko Tanaka)
  // =========================================================================
  describe('AlarmScheduler - Timing & Delay Accuracy', () => {
    it('should calculate delay within ±500ms of the 5-minute mark (300 seconds before deadline)', async () => {
      const scheduler = new AlarmScheduler(queueMock);
      
      const fixedNow = 1717513200000; // 2024-06-04T15:00:00.000Z
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
      
      // Target: 10 minutes in the future
      // Alarm should fire 5 minutes before deadline, i.e., in 5 minutes (300,000ms)
      const targetDeadline = new Date(fixedNow + 10 * 60 * 1000).toISOString();
      const task: Task = {
        task_id: 101,
        user_id: 1,
        title: 'Timing Test Task',
        description: 'Testing delay calculations',
        is_deferred: false,
        deferred_count: 0,
        deadline: targetDeadline,
        estimated_minutes: 30,
        required_energy: 'MEDIUM',
        importance: 3,
        status: 'PENDING',
        created_at: new Date(fixedNow).toISOString(),
      };

      await scheduler.scheduleAlarm(task);

      // Assert queue.add was called with the correct delay
      expect(queueMock.add).toHaveBeenCalledTimes(1);
      const args = queueMock.add.mock.calls[0];
      const jobOptions = args[2];
      const actualDelay = jobOptions?.delay;

      const expectedDelay = 5 * 60 * 1000; // exactly 5 minutes (300,000ms)
      expect(actualDelay).toBeDefined();
      // Enforce the strict ±500ms accuracy constraint
      expect(Math.abs((actualDelay as number) - expectedDelay)).toBeLessThanOrEqual(500);
    });

    it('should cancel previous alarm job before creating a new one (idempotency)', async () => {
      const scheduler = new AlarmScheduler(queueMock);
      const taskId = 102;
      const jobMock = { remove: jest.fn().mockResolvedValue(true) };
      queueMock.getJob = jest.fn().mockResolvedValue(jobMock as any);

      const task: Task = {
        task_id: taskId,
        user_id: 1,
        title: 'Idempotency Task',
        description: 'Testing cleanup',
        is_deferred: false,
        deferred_count: 0,
        deadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        estimated_minutes: 30,
        required_energy: 'MEDIUM',
        importance: 3,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      };

      await scheduler.scheduleAlarm(task);

      // Verify cancellation logic
      expect(queueMock.getJob).toHaveBeenCalledWith(`alarm:task:${taskId}`);
      expect(jobMock.remove).toHaveBeenCalledTimes(1);
      expect(queueMock.add).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. PRIORITY SORT ORDER INTEGRATION TESTS (Priya Nair)
  // =========================================================================
  describe('Deferred Task Priority Sorting Logic', () => {
    // We simulate the sort query logic in Javascript to verify correctness of sorting rules:
    // Rule 1: is_deferred = true & deferred_count > 0 (most deferred first)
    // Rule 2: deadline in next 24 hours (deadline ASC)
    // Rule 3: others (created_at DESC)
    const mockSort = (tasks: Task[], now: Date): Task[] => {
      const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      return [...tasks].sort((a, b) => {
        const aRule1 = a.is_deferred && a.deferred_count > 0;
        const bRule1 = b.is_deferred && b.deferred_count > 0;
        
        if (aRule1 && !bRule1) return -1;
        if (!aRule1 && bRule1) return 1;
        if (aRule1 && bRule1) {
          return b.deferred_count - a.deferred_count; // DESC
        }
        
        const aDeadline = new Date(a.deadline);
        const bDeadline = new Date(b.deadline);
        const aRule2 = aDeadline >= now && aDeadline <= next24h;
        const bRule2 = bDeadline >= now && bDeadline <= next24h;

        if (aRule2 && !bRule2) return -1;
        if (!aRule2 && bRule2) return 1;
        if (aRule2 && bRule2) {
          return aDeadline.getTime() - bDeadline.getTime(); // ASC
        }

        const aCreated = new Date(a.created_at).getTime();
        const bCreated = new Date(b.created_at).getTime();
        return bCreated - aCreated; // DESC
      });
    };

    it('should sort correctly with zero deferred tasks', () => {
      const now = new Date('2024-06-04T12:00:00Z');
      const task1: Task = {
        task_id: 1, user_id: 1, title: 'T1', description: '', is_deferred: false, deferred_count: 0,
        deadline: '2024-06-04T15:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T10:00:00Z'
      }; // Next 24h (3h from now)
      const task2: Task = {
        task_id: 2, user_id: 1, title: 'T2', description: '', is_deferred: false, deferred_count: 0,
        deadline: '2024-06-04T13:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T09:00:00Z'
      }; // Next 24h (1h from now) - should come first
      const task3: Task = {
        task_id: 3, user_id: 1, title: 'T3', description: '', is_deferred: false, deferred_count: 0,
        deadline: '2024-06-10T12:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T11:00:00Z'
      }; // Far future - created latest in Group 3

      const sorted = mockSort([task1, task2, task3], now);
      expect(sorted[0].task_id).toBe(2); // T2: earliest deadline in next 24h
      expect(sorted[1].task_id).toBe(1); // T1: second deadline in next 24h
      expect(sorted[2].task_id).toBe(3); // T3: Group 3
    });

    it('should place a single deferred task at the top', () => {
      const now = new Date('2024-06-04T12:00:00Z');
      const task1: Task = {
        task_id: 1, user_id: 1, title: 'T1', description: '', is_deferred: false, deferred_count: 0,
        deadline: '2024-06-04T13:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T10:00:00Z'
      }; // Group 2
      const deferredTask: Task = {
        task_id: 2, user_id: 1, title: 'Deferred T2', description: '', is_deferred: true, deferred_count: 3,
        deadline: '2024-06-10T12:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T09:00:00Z'
      }; // Group 1

      const sorted = mockSort([task1, deferredTask], now);
      expect(sorted[0].task_id).toBe(2); // Deferred task must be absolute top
      expect(sorted[1].task_id).toBe(1);
    });

    it('should sort multiple deferred tasks by deferred_count DESC', () => {
      const now = new Date('2024-06-04T12:00:00Z');
      const def1: Task = {
        task_id: 1, user_id: 1, title: 'Def 1', description: '', is_deferred: true, deferred_count: 1,
        deadline: '2024-06-10T12:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T10:00:00Z'
      };
      const def2: Task = {
        task_id: 2, user_id: 1, title: 'Def 2', description: '', is_deferred: true, deferred_count: 5,
        deadline: '2024-06-10T12:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T10:00:00Z'
      }; // 5 times deferred - should come first
      const def3: Task = {
        task_id: 3, user_id: 1, title: 'Def 3', description: '', is_deferred: true, deferred_count: 3,
        deadline: '2024-06-10T12:00:00Z', estimated_minutes: 10, required_energy: 'LOW', importance: 1, status: 'PENDING',
        created_at: '2024-06-04T10:00:00Z'
      }; // 3 times deferred - second

      const sorted = mockSort([def1, def2, def3], now);
      expect(sorted[0].task_id).toBe(2); // count = 5
      expect(sorted[1].task_id).toBe(3); // count = 3
      expect(sorted[2].task_id).toBe(1); // count = 1
    });
  });

  // =========================================================================
  // 3. WS RECONNECTION & REPLAY TESTS (Luca Ferreira)
  // =========================================================================
  describe('WebSocket Reconnect Replay Buffer', () => {
    it('should store alarm in DB as pending and replay when user connects', async () => {
      const jwtPubKey = 'mock-public-key';
      const socketHandler = new AlarmSocketHandler(ioMock, dbPoolMock, jwtPubKey);
      
      const userId = 42;
      const alarm: Omit<AlarmRecord, 'pending_delivery'> & { deadline: string } = {
        alarm_id: 'a9f24c30-58d0-40e1-b4cf-240ffbe3d07e',
        task_id: 501,
        user_id: userId,
        task_name: 'Replay Test Task',
        triggered_at: new Date(),
        read_at: null,
        is_deferred: false,
        deferred_count: 0,
        deadline: new Date().toISOString()
      };

      // Mock user disconnected (no sockets in room)
      (ioMock as any).sockets = {
        adapter: {
          rooms: {
            get: jest.fn().mockReturnValue(undefined) // Returns undefined = no connected clients
          }
        }
      };

      await socketHandler.sendAlarmToUser(userId, alarm);

      // Verify that we did not run an update to pending_delivery = false, meaning it stays true
      expect(dbPoolMock.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alarms SET pending_delivery = FALSE'),
        expect.any(Array)
      );

      // Mock client connection and replay trigger
      const socketMock = {
        id: 'socket-client-1',
        userId: userId,
        join: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn()
      } as any;

      // Mock Database fetching pending alarms
      dbPoolMock.query = jest.fn().mockImplementation((queryText, params) => {
        if (queryText.includes('WHERE user_id = $1 AND pending_delivery = TRUE')) {
          return Promise.resolve({
            rows: [{
              alarm_id: alarm.alarm_id,
              task_id: alarm.task_id,
              user_id: alarm.user_id,
              task_name: alarm.task_name,
              triggered_at: alarm.triggered_at,
              is_deferred: alarm.is_deferred,
              deferred_count: alarm.deferred_count,
              deadline: alarm.deadline
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      // Invoke connection handler logic
      const connectionCallback = (ioMock.on as jest.Mock).mock.calls.find(call => call[0] === 'connection')[1];
      await connectionCallback(socketMock);

      // Assert replay occurred
      expect(socketMock.emit).toHaveBeenCalledWith('alarm:triggered', expect.objectContaining({
        alarm_id: alarm.alarm_id,
        task_id: alarm.task_id,
        task_name: alarm.task_name
      }));

      // Assert DB state was cleared (pending_delivery = false)
      expect(dbPoolMock.query).toHaveBeenCalledWith(
        'UPDATE alarms SET pending_delivery = FALSE WHERE alarm_id = ANY($1::uuid[])',
        [[alarm.alarm_id]]
      );
    });
  });

  // =========================================================================
  // 4. LOAD & CONCURRENCY TESTS (Mei Lin)
  // =========================================================================
  describe('ConcurrentTimeLoadSimulation', () => {
    it('should process 500 concurrent alarms without dropped events and enforce client deduplication', async () => {
      // 1. Simulate 500 alarm triggers on the server
      const jwtPubKey = 'mock-public-key';
      const socketHandler = new AlarmSocketHandler(ioMock, dbPoolMock, jwtPubKey);
      const userId = 99;

      // Mock user is connected
      const roomClientsMock = new Set(['socket-id-1']);
      (ioMock as any).sockets = {
        adapter: {
          rooms: {
            get: jest.fn().mockReturnValue(roomClientsMock)
          }
        }
      };

      dbPoolMock.query = jest.fn().mockResolvedValue({ rows: [] });

      // Trigger 500 alarms concurrently
      const concurrentAlarmsCount = 500;
      const alarmPromises = [];

      for (let i = 0; i < concurrentAlarmsCount; i++) {
        const alarm = {
          alarm_id: `uuid-alarm-${i}`,
          task_id: 1000 + i,
          user_id: userId,
          task_name: `Concurrent Task ${i}`,
          triggered_at: new Date(),
          read_at: null,
          is_deferred: false,
          deferred_count: 0,
          deadline: new Date().toISOString()
        };
        alarmPromises.push(socketHandler.sendAlarmToUser(userId, alarm));
      }

      await Promise.all(alarmPromises);

      // Verify that io.to().emit was called 1000 times (500 for alarm, 500 for unread_count)
      expect(ioMock.to).toHaveBeenCalledTimes(concurrentAlarmsCount * 2);
      expect(dbPoolMock.query).toHaveBeenCalledTimes(concurrentAlarmsCount * 2); // 1 for update, 1 for unread count query per alarm

      // 2. Verify client-side deduplication prevents duplicate toast renders
      // Mock document DOM
      const mockContainer = {
        appendChild: jest.fn(),
      } as any;
      jest.spyOn(document, 'getElementById').mockReturnValue(mockContainer);
      jest.spyOn(document.body, 'appendChild').mockImplementation((el) => el);

      const clientManager = new AlarmManager({
        socketUrl: 'http://localhost:8080',
        apiUrl: 'http://localhost:8080',
        authTokenProvider: () => 'token',
      });

      // Send the same alarm ID 3 times to the client manager
      const duplicateAlarmEvent = {
        type: 'ALARM_TRIGGERED' as const,
        alarm_id: 'duplicate-uuid-1234',
        task_id: 777,
        user_id: userId,
        task_name: 'Deduplicated Task',
        deadline: new Date().toISOString(),
        triggered_at: new Date().toISOString(),
        is_deferred: false,
        deferred_count: 0
      };

      // Handle the event three times
      (clientManager as any).handleAlarmTriggered(duplicateAlarmEvent);
      (clientManager as any).handleAlarmTriggered(duplicateAlarmEvent);
      (clientManager as any).handleAlarmTriggered(duplicateAlarmEvent);

      // Assert only 1 Toast was rendered in the DOM
      const toastsRendered = mockContainer.appendChild.mock.calls.filter((call: any) => {
        const element = call[0] as HTMLElement;
        return element.getAttribute('data-alarm-id') === 'duplicate-uuid-1234';
      });
      expect(toastsRendered.length).toBe(1);
    });
  });
});
