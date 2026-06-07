// TypeScript Interfaces for SIGMA Task Management Alarm System

export interface AlarmEvent {
  type: "ALARM_TRIGGERED";
  alarm_id: string; // UUID
  task_id: number;
  user_id: number;
  task_name: string;
  deadline: string; // ISO 8601 string
  triggered_at: string; // ISO 8601 string
  is_deferred: boolean;
  deferred_count: number;
}

export interface DeferredTask {
  task_id: number;
  user_id: number;
  title: string;
  description: string;
  is_deferred: boolean;
  deferred_count: number;
  original_deadline: string; // ISO 8601 string
  deadline: string; // ISO 8601 string
  estimated_minutes: number;
  required_energy: "LOW" | "MEDIUM" | "HIGH";
  importance: number; // 1 to 5
  status: "PENDING" | "COMPLETED" | "SNOOZED" | "ARCHIVED";
  created_at: string;
}

export interface Task {
  task_id: number;
  user_id: number;
  title: string;
  description: string;
  is_deferred: boolean;
  deferred_count: number;
  deadline: string;
  estimated_minutes: number;
  required_energy: "LOW" | "MEDIUM" | "HIGH";
  importance: number;
  status: "PENDING" | "COMPLETED" | "SNOOZED" | "ARCHIVED";
  created_at: string;
}

export interface TaskListResponse {
  tasks: Task[];
}

export interface AlarmRecord {
  alarm_id: string;
  task_id: number;
  user_id: number;
  task_name: string;
  triggered_at: Date;
  read_at: Date | null;
  is_deferred: boolean;
  deferred_count: number;
  pending_delivery: boolean;
}

export interface AlarmHistoryResponse {
  sectionA: DeferredTask[]; // "미뤄진 작업" (is_deferred = true, ordered by deferred_count DESC, then triggered_at DESC)
  sectionB: AlarmRecord[];  // "알림 기록" (all other alarms, ordered by triggered_at DESC)
  unreadCount: number;      // alarms where read_at IS NULL
}
