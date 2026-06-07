-- Database Migration: Create Alarms Table & Indexes
-- Target DB: PostgreSQL

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS alarms (
    alarm_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id INTEGER NOT NULL, -- FK to tasks
    user_id INTEGER NOT NULL, -- FK to users
    task_name VARCHAR(255) NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE, -- NULL means unread
    is_deferred BOOLEAN DEFAULT FALSE,
    deferred_count INTEGER DEFAULT 0,
    pending_delivery BOOLEAN DEFAULT TRUE -- For WebSocket reconnect replay buffer
);

-- Optimize user alarm history fetching & unread counting
-- Sorting: latest triggered_at first, filterable by read_at status
CREATE INDEX IF NOT EXISTS idx_alarms_user_read_triggered 
ON alarms (user_id, read_at, triggered_at DESC);

-- Optional: Foreign Key Constraints if corresponding tables exist
-- ALTER TABLE alarms ADD CONSTRAINT fk_alarms_task_id FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE;
-- ALTER TABLE alarms ADD CONSTRAINT fk_alarms_user_id FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
