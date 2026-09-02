const assert = require('assert');
const monitorJson = JSON.stringify({ id: 1, name: "Test" });
const opts = { range: '24h', rangeStart: 1000, rangeEnd: 2000 };
const row = {
  avg_latency_ms: null,
  p95_latency_ms: null,
  checked_at_json: null,
  status_codes: null,
  latency_ms_json: null
};

function jsonNumberLiteral(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : 'null';
}

function jsonArrayLiteral(value) {
  if (typeof value !== 'string') return '[]';
  const trimmed = value.trim();
  return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed : '[]';
}

const json = `{"monitor":${monitorJson},"range":"${opts.range}","range_start_at":${opts.rangeStart},"range_end_at":${opts.rangeEnd},"avg_latency_ms":${jsonNumberLiteral(row?.avg_latency_ms)},"p95_latency_ms":${jsonNumberLiteral(row?.p95_latency_ms)},"points":{"checked_at":${jsonArrayLiteral(row?.checked_at_json)},"status_codes":${JSON.stringify(row?.status_codes ?? '')},"latency_ms":${jsonArrayLiteral(row?.latency_ms_json)}}}`;

console.log(json);
JSON.parse(json);
console.log("Success");
