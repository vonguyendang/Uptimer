-- Migration 0015: Add monitor check sampling options to reduce D1 rows_written
-- NOTE: Keep this file append-only. Future schema changes must be new migrations.

-- 1. Add fields to control UP check sampling on monitors table
ALTER TABLE monitors ADD COLUMN retain_up_check_results INTEGER NOT NULL DEFAULT 1 CHECK (retain_up_check_results IN (0, 1));
ALTER TABLE monitors ADD COLUMN up_result_sample_interval_sec INTEGER NOT NULL DEFAULT 300;

-- 2. Add last_sampled_at to monitor_state to keep track of the last time an UP check was persisted
ALTER TABLE monitor_state ADD COLUMN last_sampled_at INTEGER;

-- 3. Add an index to check_results.checked_at to optimize retention cron
CREATE INDEX IF NOT EXISTS idx_check_results_checked_at ON check_results(checked_at);
