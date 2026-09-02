/** 
 * Default interval (in seconds) between health checks for a monitor.
 * 300 seconds equals 5 minutes.
 */
export const DEFAULT_MONITOR_INTERVAL_SEC = 300;

/**
 * Default maximum timeout (in milliseconds) for each ping request.
 * If the request does not respond within this time, the monitor will be marked as DOWN.
 */
export const DEFAULT_MONITOR_TIMEOUT_MS = 10000;

/**
 * Default behavior for retaining successful (UP) ping results in the database.
 * If true, UP checks will be sampled and stored. If false, only DOWN/error checks are stored.
 */
export const DEFAULT_RETAIN_UP_CHECK_RESULTS = true;

/**
 * Minimum interval (in seconds) for sampling and storing UP results (when retain_up = true).
 * Prevents database spamming when a monitor is continuously UP every 60 seconds.
 * Defaults to 1 sample every 5 minutes (300 seconds).
 */
export const DEFAULT_UP_RESULT_SAMPLE_INTERVAL_SEC = 300;

/**
 * Maximum number of rows to delete in a single DELETE statement during the retention job.
 * Helps prevent long-running SQL queries that could lock or overload the database.
 */
export const RETENTION_DELETE_BATCH_SIZE = 1_000;

/**
 * Maximum number of iterations the retention cronjob can run per execution.
 * Combined with DELETE_BATCH_SIZE, it ensures a maximum of 10 x 1,000 = 10,000 rows are deleted per run.
 */
export const RETENTION_MAX_BATCHES_PER_RUN = 10;
