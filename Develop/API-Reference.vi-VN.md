# API-Reference.md: Uptimer (Cloudflare Runtime + D1 + Các lệnh gọi HTTP)

Mục đích: Tập trung và tổ chức các thông tin về "API môi trường chạy của nền tảng / API cơ sở dữ liệu / Lệnh gọi HTTP/TCP ra bên ngoài / API HTTP nội bộ" mà Uptimer có thể sử dụng thành một tài liệu tham khảo dễ tra cứu.

Nguồn gốc tài liệu:

- Phần "Trích xuất" dựa trên các thực tiễn sử dụng hiện có của Cloudflare Workers, D1, TCP sockets v.v. (chỉ trích xuất cách dùng API, không sao chép kiến trúc/triển khai nghiệp vụ từ bên ngoài).
- Phần "Bổ sung" dựa trên tài liệu chính thức của Cloudflare (xem References ở cuối tài liệu này).

---

## Mục lục (Contents)

- 1. Cloudflare Workers: Điểm bắt đầu và ngữ cảnh
- 2. fetch: Lệnh gọi HTTP ra ngoài (giám sát + webhook + request công cụ)
- 3. TCP sockets: `cloudflare:sockets` (Thăm dò cổng TCP)
- 4. D1: Workers Binding API (Ngữ nghĩa SQLite)
- 5. Durable Objects (Tùy chọn, dành cho thăm dò đa khu vực trong tương lai)
- 6. Web Crypto: Chữ ký Webhook (HMAC-SHA256, tùy chọn)
- 7. Workers Cache API: `caches.default` (Tùy chọn, dùng để tăng tốc giao diện công khai)
- 8. Uptimer Internal HTTP API (Dành cho Frontend gọi; tóm tắt)
- 9. Hono (Framework định tuyến của Worker)
- 10. Drizzle ORM (Driver cho D1/SQLite)

---

## 1) Cloudflare Workers: Điểm bắt đầu và ngữ cảnh

### 1.1 Điểm bắt đầu của Module Worker

```ts
export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  // Các bindings / bí mật khác...
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response('ok');
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // controller.cron: string (Biểu thức cron)
  },
} satisfies ExportedHandler<Env>;
```

Điểm liên quan:

- `scheduled()` dùng cho Cron Triggers (Cấu hình trên wrangler/Dashboard).
- `ExecutionContext.waitUntil()` dùng để kéo dài thời gian thực thi của tác vụ bất đồng bộ sau khi handler đã kết thúc (không chặn response).

### 1.2 ctx.waitUntil (Tác vụ chạy nền)

Mục đích điển hình:

- Gửi thông báo webhook
- Ghi bộ nhớ đệm (`caches.default.put`)
- Ghi log/thống kê bất đồng bộ (ví dụ: ghi vào Analytics Engine, nếu bật trong tương lai)

```ts
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(doSomethingAsync());
    return new Response('ok');
  },
};
```

Tham khảo (References):

- Workers Context API (`ctx.waitUntil`): https://developers.cloudflare.com/workers/runtime-apis/context/

### 1.3 Cron Triggers (Cấu hình wrangler)

```toml
[triggers]
crons = ["* * * * *"] # Mỗi phút
```

Lưu ý:

- Cron được diễn giải theo giờ UTC, thời điểm kích hoạt có thể bị lệch một chút (jitter); Uptimer cần "thăm dò khi đến hạn" dựa trên `interval_sec`, thay vì mặc định quét toàn bộ mỗi phút.

### 1.4 Thông tin Incoming Request CF (Chỉ khả dụng trong fetch handler)

Trong `fetch()`, có thể đọc thông tin ngữ cảnh do Cloudflare đưa vào (ví dụ: colo / country / tls v.v.). `scheduled()` không có inbound request, nên không thể sử dụng.

```ts
export default {
  async fetch(request: Request) {
    // @ts-expect-error: request.cf chỉ dành cho Workers.
    const colo = request.cf?.colo;
    // @ts-expect-error: request.cf chỉ dành cho Workers.
    const country = request.cf?.country;
    return Response.json({ colo, country });
  },
};
```

### 1.5 Giới hạn đồng thời (p-limit, dùng khi thăm dò hàng loạt)

Dựa trên thực tiễn Workers: Workers có giới hạn về số lượng kết nối outbound đồng thời, khi thăm dò hàng loạt, nên đặt giới hạn (ví dụ: 5).

```ts
import pLimit from 'p-limit';

const limit = pLimit(5);
const results = await Promise.all(monitors.map((m) => limit(() => runCheck(m))));
```

---

## 2) fetch: Lệnh gọi HTTP ra ngoài (giám sát + webhook + request công cụ)

### 2.1 Vô hiệu hóa bộ nhớ đệm (Bắt buộc đối với yêu cầu giám sát)

Với `fetch`, Workers hỗ trợ `cache: 'no-store' | 'no-cache'` (chỉ hỗ trợ 2 loại này).

Khuyến nghị (Dành cho request đến mục tiêu giám sát):

```ts
const res = await fetch(url, {
  method: 'GET',
  cache: 'no-store',
  cf: {
    // Vô hiệu hóa đệm cho tất cả các mã trạng thái
    cacheTtlByStatus: { '100-599': -1 },
  },
});
```

Tham khảo (References):

- fetch cache directives (no-store / no-cache): https://developers.cloudflare.com/workers/examples/cache-using-fetch/
- fetch cf cache ví dụ (kèm cấu trúc cacheTtlByStatus): https://developers.cloudflare.com/workers/examples/cache-using-fetch/

### 2.2 Đóng gói thời gian chờ bằng AbortController

```ts
export function fetchTimeout(
  url: string,
  ms: number,
  init: RequestInit<RequestInitCfProperties> = {},
): Promise<Response> {
  const controller = new AbortController();

  // Nếu người gọi truyền signal, sẽ chuyển tiếp abort
  if (init.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  const t = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}
```

Lời khuyên thực tế:

- Mặc định 10s cho mục tiêu giám sát; 5s cho webhook (có thể cấu hình).
- Với các tình huống cần đọc nội dung phản hồi (body) để xác nhận (assertion), hãy cố gắng gọi `response.body?.cancel()` sau khi hoàn tất, tránh chiếm dụng kết nối dài.

### 2.3 Phân tích vị trí chạy Cloudflare (colo)

Thực tiễn: Request tới `https://cloudflare.com/cdn-cgi/trace` và phân tích dòng `colo=...`.

```ts
export async function getWorkerColo(): Promise<string | null> {
  const res = await fetch('https://cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
  const text = await res.text();
  return /^colo=(.*)$/m.exec(text)?.[1] ?? null;
}
```

Giải thích:

- `scheduled()` không có request chiều vào (inbound request), do đó không thể dùng `request.cf.colo`. Dùng cách trace là một giải pháp khả thi.

### 2.4 Gửi Webhook (JSON / form / query param)

Định dạng JSON:

```ts
const headers = new Headers({
  'Content-Type': 'application/json',
  'User-Agent': 'Uptimer/0.1',
});
headers.set('Authorization', 'Bearer <token>'); // Tùy chọn

const resp = await fetchTimeout(webhookUrl, 5000, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
});
```

Định dạng `application/x-www-form-urlencoded`:

```ts
const resp = await fetchTimeout(webhookUrl, 5000, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ a: '1', b: '2' }).toString(),
});
```

Tham số truy vấn (Query param) (thường dùng cho GET webhook):

```ts
const u = new URL(webhookUrl);
u.searchParams.set('msg', 'hello');
const resp = await fetchTimeout(u.toString(), 5000, { method: 'GET' });
```

### 2.5 Tiêu đề phản hồi (Response headers: CORS / no-store)

Dựa trên thực tiễn Edge API: Các giao diện dữ liệu công khai thường thêm CORS; Giao diện loại trạng thái/huy hiệu (badge) thường từ chối dùng cache rõ ràng.

```ts
const headers = new Headers({
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
});

return new Response(JSON.stringify({ ok: true }), { headers });
```

---

## 3) TCP sockets: `cloudflare:sockets` (Thăm dò cổng TCP)

### 3.1 Kết nối và đóng (API Chính thức)

```ts
import { connect } from 'cloudflare:sockets';

const socket = connect({ hostname: 'example.com', port: 443 });
const writer = socket.writable.getWriter();
await writer.write(new TextEncoder().encode('...'));
await writer.close();
socket.close();
```

Tham khảo:

- TCP sockets API: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/

### 3.1.1 Trích xuất: Viết theo kiểu import động cho một số bundler

Khi build chain của bạn có vấn đề về đóng gói/phân tích với `cloudflare:sockets`, có thể dùng import động:

```ts
const connect = await import('cloudflare:sockets').then((m) => m.connect);
const socket = connect({ hostname: 'example.com', port: 443 });
```

### 3.2 Dùng cho health-check TCP (Thời gian trễ khi bắt tay - handshake latency)

Workers TCP Socket `Socket` cung cấp (Theo mô tả tài liệu):

- Một Promise "được resolve sau khi thiết lập kết nối" (thường gọi là `socket.opened`)
- Một Promise "được resolve sau khi đóng kết nối" (thường gọi là `socket.closed`)
- Hàm `socket.close()` buộc đóng hai đầu đọc ghi

Khuyến nghị (Chỉ thực hiện bắt tay + lập tức đóng):

```ts
import { connect } from 'cloudflare:sockets';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => t && clearTimeout(t));
}

export async function tcpPing(hostname: string, port: number, timeoutMs: number): Promise<number> {
  const start = Date.now();
  const socket = connect({ hostname, port });
  // @ts-expect-error: Workers runtime Socket có opened/closed promises.
  await withTimeout(socket.opened, timeoutMs);
  socket.close();
  return Date.now() - start;
}
```

Lưu ý:

- Thăm dò TCP là một "khả năng SSRF/thăm dò cổng được kiểm soát", bắt buộc phải xác thực mục tiêu và giới hạn tần suất (xem chương bảo mật trong `Application.md`).

---

## 4) D1: Workers Binding API (Ngữ nghĩa SQLite)

### 4.1 Binding với wrangler (Ví dụ)

```toml
[[d1_databases]]
binding = "DB"
database_name = "uptimer"
database_id = "<uuid>"
```

Tham khảo:

- Wrangler cấu hình D1 bindings: https://developers.cloudflare.com/workers/wrangler/configuration/

### 4.2 Prepared Statement: prepare / bind / run / first / raw

```ts
// 1) run(): Trả về D1Result (bao gồm meta + results)
const r1 = await env.DB.prepare('SELECT * FROM monitors WHERE id = ?')
  .bind(123)
  .run<{ id: number; name: string }>();

// 2) first(): Trả về đối tượng hàng đầu tiên hoặc null (không có meta)
const row = await env.DB.prepare('SELECT * FROM monitors WHERE id = ?')
  .bind(123)
  .first<{ id: number; name: string }>();

// 3) raw(): Trả về mảng 2 chiều (Có thể tùy chọn columnNames)
const raw = await env.DB.prepare('SELECT id, name FROM monitors ORDER BY id DESC LIMIT 10').raw({
  columnNames: true,
});
```

Điểm chính:

- `run()` và `all()` trong D1 tương đương nhau (Tài liệu nói run có thể được coi là alias của all); Khi thực hiện thao tác ghi, mảng `results` sẽ rỗng, thông tin thay đổi nằm trong `meta.changes/last_row_id`.
- Liên kết tham số (parameterized bindings) tuân theo SQLite: `?`, `?1`, `?2` v.v. (tránh SQL injection).
- Nếu tham số của bạn là một mảng, hãy dùng `.bind(...params)` (đừng truyền mảng dưới dạng 1 tham số duy nhất).

Bổ sung: `all()` (Tương đương `run()`)

```ts
const r = await env.DB.prepare('SELECT * FROM monitors').all();
```

Bổ sung: `first(columnName)` (Chỉ lấy giá trị của một cột từ hàng đầu tiên)

```ts
const lastId = await env.DB.prepare('SELECT MAX(id) AS id FROM monitors').first<number>('id');
```

Tham khảo:

- Prepared statements (bind/run/first/raw): https://developers.cloudflare.com/d1/worker-api/prepared-statements/

### 4.3 D1Database.batch (Thực thi hàng loạt nhiều câu lệnh)

```ts
const stmts = [
  env.DB.prepare(
    'INSERT INTO check_results (monitor_id, checked_at, status) VALUES (?, ?, ?)',
  ).bind(monitorId, checkedAt, status),
  env.DB.prepare(
    'UPDATE monitor_state SET status = ?, last_checked_at = ? WHERE monitor_id = ?',
  ).bind(status, checkedAt, monitorId),
];

const results = await env.DB.batch(stmts);
// results: D1Result[], mỗi kết quả cho một câu lệnh (bao gồm meta)
```

Tham khảo:

- D1 Database batch/exec tutorial examples: https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1

### 4.4 D1Database.exec (Thực thi chuỗi SQL thô)

```ts
await env.DB.exec('PRAGMA foreign_keys = ON;');
```

Lưu ý:

- `exec()` không hỗ trợ tham số bind; chỉ dùng cho những SQL được kiểm soát tĩnh (ví dụ bảo trì/gỡ lỗi/lệnh cố định), không dùng để ghép nối đầu vào từ người dùng.

Tham khảo:

- D1 exec ví dụ: https://developers.cloudflare.com/d1/worker-api/return-object

### 4.5 Trích xuất: Dùng "D1 giống như KV" (Ví dụ)

Một cách viết nhỏ gọn phổ biến ở thời kì đầu là tạo một bảng `kv_store(key, value)` trong D1 và sử dụng UPSERT để lưu/đọc một blob trạng thái JSON lớn:

```ts
// Lấy
const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?')
  .bind('state')
  .first<{ value: string }>();

// Đặt (UPSERT)
await env.DB.prepare(
  'INSERT INTO kv_store (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
)
  .bind('state', stateJson)
  .run();
```

Giải thích:

- Uptimer v0.x sử dụng cách "Bảng quan hệ + retention (lưu giữ dữ liệu)", không khuyến khích dồn toàn bộ trạng thái vào một blob; nhưng ví dụ trên rất trực quan để hiểu prepare/bind/run của D1.

### 4.6 Khóa phân tán (Distributed lock) của D1 (lease lock, chống chạy chồng scheduled)

Uptimer v0.x khuyên dùng `locks(name, expires_at)` trên D1 để thực thi một lease (khóa thuê bao) đơn giản:

Lấy khóa (Chỉ đè lên khi không tồn tại hoặc đã hết hạn):

```ts
const now = Math.floor(Date.now() / 1000);
const ttl = 55;
const expiresAt = now + ttl;

const sql =
  'INSERT INTO locks (name, expires_at) VALUES (?, ?) ' +
  'ON CONFLICT(name) DO UPDATE SET expires_at = excluded.expires_at ' +
  'WHERE locks.expires_at <= ?;';

const r = await env.DB.prepare(sql).bind('scheduler', expiresAt, now).run();
const acquired = (r.meta?.changes ?? 0) > 0;
```

Thả khóa (Tùy chọn; thường cứ để nó tự hết hạn là được):

```ts
await env.DB.prepare('DELETE FROM locks WHERE name = ?').bind('scheduler').run();
```

### 4.7 Các bảng fast path cho public snapshot

Đường cơ sở bản phát hành hiện tại sử dụng kho ảnh chụp tĩnh D1 (static snapshot) + các đoạn dữ liệu (fragments) để hỗ trợ cấu hình Free Plan CPU:

```sql
CREATE TABLE IF NOT EXISTS public_snapshots (
  key TEXT PRIMARY KEY,
  generated_at INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

CREATE TABLE IF NOT EXISTS public_snapshot_guard_versions (
  key TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  state_json TEXT
);

CREATE TABLE IF NOT EXISTS public_snapshot_fragments (
  snapshot_key TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (snapshot_key, fragment_key)
);
CREATE INDEX IF NOT EXISTS idx_public_snapshot_fragments_snapshot_generated
  ON public_snapshot_fragments(snapshot_key, generated_at);
```

Quy ước từ khóa (Key conventions):

- `public_snapshots.key`: `homepage` / `status` / `homepage:artifact`.
- `public_snapshot_fragments.snapshot_key`: `homepage:envelope`、`homepage:monitors`、`status:envelope`、`status:monitors`、`homepage:artifact:monitors`、`monitor-runtime:updates`。
- Các hàng thông tin (artifact rows) sử dụng `updated_at` cho tính mới (freshness) đối với public, trong khi dữ liệu nội dung/snapshot (body/snapshot) vẫn phải qua bước xác thực đối với `generated_at` đã được lưu trữ.

### 4.8 Dọn dẹp lưu giữ (Xóa check_results đã quá hạn)

```ts
const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
await env.DB.prepare('DELETE FROM check_results WHERE checked_at < ?').bind(cutoff).run();
```

---

## 5) Durable Objects (Tùy chọn, dành cho thăm dò đa khu vực trong tương lai)

Một giải pháp thay thế là sử dụng DO như một công cụ "Thăm dò từ xa yêu cầu dựa theo locationHint", những thành phần API cốt lõi:

```ts
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  REMOTE_CHECKER_DO: DurableObjectNamespace<RemoteChecker>;
}

export class RemoteChecker extends DurableObject {
  async getLocationAndStatus(payload: unknown) {
    // ... chạy lượt thăm dò ...
    return { location: 'HKG', status: { up: true, ping: 12, err: '' } };
  }
}
```

Ví dụ bên gọi:

```ts
const id = env.REMOTE_CHECKER_DO.idFromName(monitorId);
const stub = env.REMOTE_CHECKER_DO.get(id, { locationHint: 'hkg' as DurableObjectLocationHint });
const resp = await stub.getLocationAndStatus(monitorConfig);
```

Lưu ý:

- DO thuộc về các mở rộng từ v1+; v0.1 không đưa vào (để tránh sự phức tạp).
- Yêu cầu chính xác cho những cờ tương thích (compatibility flags) / mô hình RPC sẽ dựa theo mô tả trong Tài liệu DO của Cloudflare.

---

## 6) Web Crypto: Chữ ký Webhook (HMAC-SHA256, tùy chọn)

Dùng để xác thực phía nhận webhook, tránh các cuộc tấn công phát lại (replay-attacks).

```ts
function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(sig);
}
```

Khuyến nghị sử dụng:

- Gửi đi:
  - `X-Uptimer-Timestamp: <unix seconds>`
  - `X-Uptimer-Signature: sha256=<hex>`
  - `signature = HMAC(secret, timestamp + "." + rawBody)`
- Bên nhận kiểm tra timestamp có trong khoảng thời gian chấp nhận hay không (vd: 5 phút), và đối chiếu lại chữ ký.

---

## 7) Workers Cache API: `caches.default` (Tùy chọn, dùng để tăng tốc giao diện công khai)

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const res = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    });

    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
};
```

Lưu ý:

- Các yêu cầu thăm dò mục tiêu phải tắt bộ nhớ cache (xem 2.1), Cache API này chỉ dùng để đệm thông tin public API/trang trạng thái của riêng bạn.

Tham khảo (References):

- cache-using-fetch (có ví dụ về caches.default.put): https://developers.cloudflare.com/workers/examples/cache-using-fetch/

---

## 8) Uptimer Internal HTTP API (Dành cho Frontend gọi; tóm tắt)

Chi tiết vui lòng xem `Application.md`, đây chỉ là danh sách các endpoints "sẽ được gọi tới":

Public (Không cần Authentication):

- `GET /api/v1/public/homepage`
- `GET /api/v1/public/homepage-artifact`
- `GET /api/v1/public/status`
- `GET /api/v1/public/monitors/:id/latency?range=24h`
- `GET /api/v1/public/monitors/:id/uptime?range=24h|7d|30d`
- `GET /api/v1/public/incidents?limit=20`
- `GET /api/v1/public/maintenance-windows?limit=20`

Admin (Bearer Token):

- `GET /api/v1/admin/monitors`
- `POST /api/v1/admin/monitors`
- `PATCH /api/v1/admin/monitors/:id`
- `DELETE /api/v1/admin/monitors/:id`
- `POST /api/v1/admin/monitors/:id/test`
- `GET /api/v1/admin/notification-channels`
- `POST /api/v1/admin/notification-channels`
- `PATCH /api/v1/admin/notification-channels/:id`
- `DELETE /api/v1/admin/notification-channels/:id`
- `POST /api/v1/admin/notification-channels/:id/test`
- `GET /api/v1/admin/incidents`
- `POST /api/v1/admin/incidents`
- `POST /api/v1/admin/incidents/:id/updates`
- `PATCH /api/v1/admin/incidents/:id/resolve`

Internal (Bearer Token; chỉ dùng với scheduled/service-binding):

- `POST /api/v1/internal/scheduled/check-batch`
- `POST /api/v1/internal/write/runtime-update-fragments`
- `POST /api/v1/internal/refresh/runtime-fragments`
- `POST /api/v1/internal/seed/sharded-public-snapshot`
- `POST /api/v1/internal/assemble/sharded-public-snapshot`
- `POST /api/v1/internal/continue/sharded-public-snapshot`

Các biến Free Plan CPU profile được viết trong file `Develop/Worker-CPU-10ms-Release-Readiness.md` và được bật ở file `apps/worker/wrangler.toml`. **KHÔNG** bật biến `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED` cho mục tiêu phát hành.

---

## 9) Hono (Framework định tuyến của Worker)

Khung (Basic):

```ts
import { Hono } from 'hono';

type Bindings = { DB: D1Database; ADMIN_TOKEN: string };
const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/v1/public/status', (c) => c.json({ ok: true }));

export default app;
```

Đọc JSON Body:

```ts
app.post('/api/v1/admin/monitors', async (c) => {
  const body = await c.req.json();
  return c.json({ received: body });
});
```

Đoạn Middleware để chứng thực (Ví dụ):

```ts
import { createMiddleware } from 'hono/factory';

export const requireAdmin = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  const expected = `Bearer ${c.env.ADMIN_TOKEN}`;
  if (auth !== expected)
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
  await next();
});
```

Mở CORS (Tùy chọn, phù hợp cho public API):

```ts
import { cors } from 'hono/cors';

app.use('/api/v1/public/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));
```

---

## 10) Drizzle ORM (Driver cho D1/SQLite)

Khởi tạo Client (bên trong Worker):

```ts
import { drizzle } from 'drizzle-orm/d1';

export function getDb(env: { DB: D1Database }) {
  return drizzle(env.DB);
}
```

Ví dụ truy vấn (Mang phong cách sử dụng trong Drizzle Cloudflare D1 documentation):

```ts
import { drizzle } from 'drizzle-orm/d1';
import { users } from './schema';

const db = drizzle(env.DB);
const rows = await db.select().from(users).all();
```

Ví dụ lệnh Ghi (insert / update / delete, thao tác chung của Drizzle):

```ts
import { eq } from 'drizzle-orm';
import { users } from './schema';

await db.insert(users).values({ name: 'Andrew' });
await db.update(users).set({ name: 'Mr. Dan' }).where(eq(users.name, 'Dan'));
await db.delete(users).where(eq(users.name, 'Mr. Dan'));
```

Chạy mã SQL nguyên gốc (Drizzle `sql`, Drizzle usage tiêu chuẩn):

```ts
import { sql } from 'drizzle-orm';

const id = 69;
const r = await db.execute(sql`select * from ${users} where ${users.id} = ${id}`);
```

Lưu ý:

- Uptimer sử dụng cơ sở “SQL migrations thông qua Wrangler” làm nòng cốt; Drizzle schema dùng cho kiểu phân loại an toàn và hỗ trợ lấy tin, cả hai phải có tính thống nhất.

## Tham khảo (References)

Cloudflare Workers:

- Cron Triggers / scheduled: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Context API / waitUntil: https://developers.cloudflare.com/workers/runtime-apis/context/
- Request.cf (IncomingRequestCfProperties): https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
- fetch & cache ví dụ: https://developers.cloudflare.com/workers/examples/cache-using-fetch/
- TCP sockets: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- Wrangler config: https://developers.cloudflare.com/workers/wrangler/configuration/

Cloudflare D1:

- Prepared statements: https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- Truy vấn D1 best practices: https://developers.cloudflare.com/d1/best-practices/query-d1/
- D1 API tutorial (ví dụ batch/exec): https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1
- D1 return object / exec ví dụ: https://developers.cloudflare.com/d1/worker-api/return-object

Hono:

- Hono docs: https://hono.dev/

Drizzle ORM:

- Cloudflare D1 connection: https://orm.drizzle.team/docs/connect-cloudflare-d1
- SQL template (`sql`): https://orm.drizzle.team/docs/sql
- Insert / Update / Delete:
  - https://orm.drizzle.team/docs/insert
  - https://orm.drizzle.team/docs/update
  - https://orm.drizzle.team/docs/delete
