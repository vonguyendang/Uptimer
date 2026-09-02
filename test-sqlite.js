const Database = require('better-sqlite3');
const db = new Database(':memory:');
const r = db.prepare(`
WITH ordered_points AS (SELECT 1 AS checked_at, 'u' AS status_code, 100 AS latency_ms WHERE 1=0),
up_latencies AS (SELECT latency_ms, row_number() OVER (ORDER BY latency_ms) AS rn, count(*) OVER () AS cnt FROM ordered_points WHERE status_code = 'u' AND latency_ms IS NOT NULL)
SELECT
  COALESCE((SELECT json_group_array(checked_at) FROM ordered_points), '[]') AS checked_at_json,
  COALESCE((SELECT group_concat(status_code, '') FROM ordered_points), '') AS status_codes,
  COALESCE((SELECT json_group_array(latency_ms) FROM ordered_points), '[]') AS latency_ms_json,
  CAST(round((SELECT avg(latency_ms) FROM up_latencies)) AS INTEGER) AS avg_latency_ms,
  (SELECT latency_ms FROM up_latencies WHERE rn = ((95 * cnt + 99) / 100) LIMIT 1) AS p95_latency_ms
`).get();
console.log("SQLITE OUTPUT:");
console.log(r);
