# Application.md: Uptimer

Phiên bản: 0.1.0 (Bản nháp, đã chỉnh sửa)
Loại: Đặc tả Kỹ thuật & Kiến trúc Ứng dụng
Nền tảng: Cloudflare Native (Workers + Pages + D1)
Cập nhật lần cuối: 2026-01-28

---

## 0. Đối tượng Độc giả & Phạm vi

Tài liệu này được sử dụng trong giai đoạn khởi tạo dự án để làm rõ các đặc tả kỹ thuật, với mục tiêu giải thích rõ ràng một lần về việc Uptimer "sẽ làm gì / không làm gì / làm như thế nào / dữ liệu lưu trữ ra sao / API cung cấp như thế nào", tạo thuận lợi cho việc phân chia nhiệm vụ và triển khai sau này.

Tài liệu này mặc định áp dụng cho kiến trúc đơn khách hàng (single-tenant - một trang web do một đội ngũ/cá nhân duy trì), việc hỗ trợ đa khách hàng (multi-tenant) sẽ là phần mở rộng sau.

---

## 1. Tóm tắt Dự án (Executive Summary)

Uptimer là một nền tảng giám sát tính khả dụng Serverless + trang trạng thái + quản lý sự cố được xây dựng trên mạng biên (edge network) của Cloudflare.

Mục tiêu cốt lõi:

- Zero-Ops: Không máy chủ, không container, không cần tự xây dựng phiên bản cơ sở dữ liệu.
- Cloudflare-native: Workers đảm nhận API và thăm dò định kỳ; Pages lưu trữ Web UI; D1 lưu trữ cấu hình và dữ liệu lịch sử.
- Khả năng sử dụng ngay (Out-of-the-box): Ưu tiên tính dễ bảo trì, chi phí thấp, và khả năng tùy biến cho "cá nhân/nhóm nhỏ".

Nhấn mạnh sự khác biệt (cần khớp với các ràng buộc môi trường chạy của Cloudflare):

- Ý nghĩa thực sự của "Edge-first": Các lượt thăm dò được bắt đầu từ môi trường chạy Cloudflare (không phải VPS đơn máy truyền thống), nhưng Cron Trigger không đảm bảo chạy trên tất cả các node biên; nếu cần thăm dò đa khu vực (multi-region), cần có thiết kế "đa đầu dò" (multi-probe) bổ sung (xem mục 6.7 và 15).

---

## 2. Mục tiêu & Phi Mục tiêu (Goals / Non-goals)

### 2.1 Mục tiêu (Goals)

- Hỗ trợ thăm dò HTTP(S) và TCP; cung cấp cấu hình thời gian chờ, thử lại, xác nhận (assertions) và tiết lưu cảnh báo (alert throttling).
- Cung cấp trang trạng thái công khai (trạng thái tổng hợp + danh sách thành phần + sự kiện lịch sử).
- Cung cấp bảng điều khiển quản trị (quản lý mục giám sát, quản lý sự cố, cấu hình kênh thông báo, cài đặt hệ thống).
- Dữ liệu có thể truy xuất: Giữ lại các bản ghi thăm dò cần thiết cho biểu đồ, tính toán SLA, kiểm toán và truy vết vấn đề, đồng thời kiểm soát sự gia tăng kích thước của D1.

### 2.2 Phi Mục tiêu (Non-goals, v0.x)

- Không làm thành một nền tảng APM đầy đủ, theo dõi chuỗi (distributed tracing), nền tảng log.
- Không theo đuổi ICMP Ping gốc (Môi trường Workers không cung cấp ICMP tiêu chuẩn). Thống nhất sử dụng chỉ số Latency (Độ trễ), mô phỏng bằng HTTP fetch / TCP connect.
- Không làm hệ thống RBAC/tính cước đa khách hàng phức tạp; v0.x cố định là "đơn khách hàng + Token quản trị đơn".

---

## 3. Các Ràng buộc & Nguyên tắc Thiết kế Chính (Constraints & Principles)

### 3.1 Ràng buộc Cloudflare Workers (Ảnh hưởng trực tiếp đến thiết kế)

- Các Cron Triggers được kích hoạt thông qua sự kiện `scheduled()`; chạy theo biểu thức cron được cấu hình trong wrangler/Dashboard (UTC), thời gian kích hoạt có thể bị giật/lệch (jitter/drift), và không đảm bảo thực thi trên tất cả các node biên. Tham khảo: Tài liệu Workers Cron Triggers.
- Yêu cầu thăm dò chiều ra (outbound) phải tránh bị ảnh hưởng bởi bộ đệm (cache) của Cloudflare: vô hiệu hóa bộ đệm rõ ràng cho các yêu cầu thăm dò HTTP (xem 6.2).
- Việc thăm dò TCP phải sử dụng API TCP Socket của Workers: `import { connect } from 'cloudflare:sockets'` (xem 6.3). Khả năng này chỉ hỗ trợ TCP chiều ra, không tương đương với ICMP.
- Cần kiểm soát đồng thời (concurrency): Workers có giới hạn thời gian chạy đối với các kết nối outbound đồng thời, cần thiết lập giới hạn trên (ví dụ: mặc định là 5) để tránh cạn kiệt tài nguyên và mất ổn định.

### 3.2 Ràng buộc Cơ sở dữ liệu (D1/SQLite)

- Bản chất của D1 là ngữ nghĩa SQLite, phù hợp với dữ liệu có cấu trúc quy mô trung bình; việc ghi tần suất cao phải được kết hợp với chính sách lưu giữ dữ liệu (Retention) và việc tổng hợp/lưu trữ (archiving) cần thiết, nếu không bảng sẽ phình to nhanh chóng.
- Cả việc đọc và ghi đều phải thông qua D1 binding API (như `env.DB.prepare(...).bind(...).run()`), cố gắng sử dụng parameterized SQL để chống SQL injection. Tham khảo: Tài liệu D1 prepared statements.

### 3.3 Nguyên tắc Thiết kế

- "Ưu tiên khả năng thực hiện": Trong v0.x, chạy thành công HTTP/TCP, cảnh báo, trang trạng thái và sự kiện trước, tránh thiết kế quá mức (over-engineering).
- "Có thể mở rộng, không bị khóa cứng": Mô hình dữ liệu và API phải dành sẵn các điểm mở rộng cho thăm dò đa khu vực, nhiều kênh thông báo hơn, nhiều chiều dữ liệu biểu đồ hơn.
- "Mặc định an toàn": Xác thực (auth) nền, xác thực dữ liệu đầu vào (input validation), phòng chống lạm dụng SSRF/quét cổng (port scanning) phải được thiết kế ngay từ phiên bản đầu tiên.

---

## 4. Ngăn xếp Công nghệ (Tech Stack)

Frontend (Bảng điều khiển + Trang trạng thái):

- Máy chủ (Host): Cloudflare Pages
- Framework: React + Vite (TypeScript)
- Styling: Tailwind CSS
- Router: React Router
- Lấy Dữ liệu (Data Fetching): TanStack Query
- Form/Xác thực: React Hook Form + Zod
- Biểu đồ: Recharts

Backend (API + Trình lập lịch):

- Máy chủ (Host): Cloudflare Workers
- Trình kích hoạt (Triggers): HTTP (`fetch`) + Cron (`scheduled`)
- Ngôn ngữ: TypeScript
- Định tuyến (Routing): Hono
- Xác thực dữ liệu: Zod
- Kiểm soát đồng thời: p-limit (giới hạn các lượt kiểm tra outbound)

Lưu trữ:

- DB Cốt lõi: Cloudflare D1
- SQL/ORM: Drizzle ORM (Driver D1/SQLite)
- Migrations: SQL migrations được quản lý qua Wrangler (`wrangler d1 migrations`)

---

## 5. Kiến trúc Hệ thống (System Architecture)

### 5.1 Phân chia Thành phần

- Pages Web: Trang trạng thái công khai + UI quản trị.
- Worker API: Cung cấp REST API (public/admin), tổng hợp dữ liệu từ D1.
- Worker Scheduler: Động cơ thăm dò được kích hoạt bằng Cron (có thể chung một module Worker với API).
- D1: Cấu hình, trạng thái, sự kiện và dữ liệu lịch sử.
- Thông báo bên ngoài: Webhook (Discord/Slack/Telegram/Tùy chỉnh).

### 5.2 Sơ đồ Kiến trúc (Conceptual)

```mermaid
graph TD
  Visitor[Khách truy cập] -->|HTTPS| Pages[Cloudflare Pages (UI)]
  Admin[Quản trị viên] -->|HTTPS| Pages

  Pages -->|fetch /api| Worker[Cloudflare Worker (API)]
  Worker --> D1[(D1 Database)]

  Cron[Cron Trigger] --> Scheduler[Worker (scheduled: Monitor Engine)]
  Scheduler -->|HTTP fetch / TCP connect| Targets[Dịch vụ Đích]
  Scheduler -->|write results| D1
  Scheduler -->|webhook| Notify[Thông báo Bên ngoài]
```

---

## 6. Thiết kế Động cơ Giám sát (Monitor Engine)

### 6.1 Các Khái niệm Cốt lõi

- Monitor: Một đối tượng được giám sát (HTTP URL hoặc TCP host:port).
- Check: Một lần thăm dò (có thể bao gồm nhiều lần thử lại).
- State: Trạng thái hiện tại của mục giám sát (UP/DOWN/MAINTENANCE/PAUSED/UNKNOWN).
- Outage: Một khoảng thời gian lỗi từ UP -> DOWN -> UP (dùng cho SLA và tự động hóa sự kiện).

### 6.2 Monitor HTTP(S)

Các tính năng được hỗ trợ (v0.x):

- Method: GET/HEAD/POST/PUT/DELETE (Mặc định là GET).
- Timeout: Mặc định là 10s (Có thể cấu hình).
- Headers: Có thể cấu hình; mặc định gắn thêm `User-Agent: Uptimer/<version>`.
- Body: Tùy chọn (Chủ yếu dùng cho thăm dò POST).
- Status code assertion (Xác nhận mã trạng thái):
  - Mặc định: 2xx được coi là thành công (có thể tùy chọn bao gồm 3xx).
  - Có thể cấu hình danh sách mã cho phép (ví dụ `[200,204,301]`).
- Response assertion (Xác nhận phản hồi):
  - `responseKeyword`: Bắt buộc chứa (Tùy chọn).
  - `responseForbiddenKeyword`: Bắt buộc không chứa (Tùy chọn).

Tránh ô nhiễm bộ nhớ đệm (Quan trọng):

- Phải vô hiệu hóa bộ nhớ đệm rõ ràng đối với các yêu cầu thăm dò (fetch) để tránh bộ nhớ đệm của Cloudflare gây ra "thành công giả/thất bại giả":
  - Tùy chọn `fetch` tiêu chuẩn có thể dùng `cache: 'no-store'|'no-cache'`.
  - Cũng có thể kiểm soát hành vi đệm thông qua `cf.cacheTtlByStatus` (Tham khảo cấu hình fetch và cache của Workers).
  - Đề xuất triển khai: Cấu hình không đệm cho tất cả các mã trạng thái (ví dụ `cf.cacheTtlByStatus: { '100-599': -1 }`), và gắn thêm một tham số query ngẫu nhiên nếu cần để dự phòng.

Lưu ý về TLS:

- v0.x coi "TLS khả dụng/đáng tin cậy" là một phần kiểm tra: Chứng chỉ hết hạn hoặc không đáng tin cậy sẽ khiến fetch thất bại, từ đó đánh giá là DOWN.
- Chức năng "Cảnh báo trước N ngày khi chứng chỉ hết hạn" cần lấy thông tin NotAfter của chứng chỉ, bản thân `fetch` của Workers không trực tiếp để lộ chuỗi chứng chỉ; khả năng này sẽ là một phần nâng cấp sau này (xem 16).

### 6.3 Monitor TCP Port

Phương thức triển khai:

- Sử dụng API TCP Socket của Workers:
  - `import { connect } from 'cloudflare:sockets'`
  - Đợi kết nối được thiết lập sau lệnh `connect({ hostname, port })` rồi đóng ngay lập tức
- Lấy "Bắt tay TCP có thành công hay không + Thời gian tiêu tốn" làm chỉ số cho tính khả dụng và độ trễ.

Lưu ý:

- Đây không phải là ICMP; nhưng nó rất hiệu quả đối với "khả năng tiếp cận cổng" (port reachability).
- Cần có kiểm tra mục tiêu và kiểm soát tốc độ (rate control), tránh bị lạm dụng thành công cụ quét cổng (port scanner) (xem 12.2).

### 6.4 Chiến lược "Ping/ICMP"

Workers không cung cấp ICMP gốc; định nghĩa trong v0.x:

- Trường chỉ số thống nhất: `latency_ms` (Văn bản trên UI thống nhất dùng "Latency", không xuất hiện "ICMP Ping").
- HTTP Monitor: `latency_ms =` Thời gian từ lúc gọi `fetch()` đến khi nhận được response headers (Không bao gồm việc đọc toàn bộ body; nếu việc xác nhận keyword cần đọc body, thời gian đó sẽ bị tiêu tốn thêm và cần được đánh dấu riêng).
- TCP Monitor: `latency_ms =` Thời gian từ lúc gọi `connect()` đến khi `socket.opened` được resolve.

### 6.5 Thử lại, Biến động và Máy Trạng thái (Flapping Control)

Chiến lược khuyến nghị (Có thể cấu hình):

- Nếu một Check (lượt kiểm tra) thất bại, hãy thực hiện thử lại nhanh 1~2 lần (ví dụ khoảng cách 300ms/800ms).
- Chỉ chuyển từ UP -> DOWN khi "Số lần thất bại liên tiếp đạt ngưỡng" (ví dụ 2/3).
- Việc phục hồi cũng tương tự: chỉ chuyển từ DOWN -> UP khi số lần thành công liên tiếp đạt ngưỡng (ví dụ 2).
- Tiết lưu cảnh báo (Alert throttling):
  - Thời gian ân hạn (Grace period) (ví dụ: DOWN phải kéo dài >= 1 phút mới gửi cảnh báo đầu tiên).
  - Có thông báo khi nguyên nhân lỗi (Error reason) thay đổi hay không (tùy chọn).

### 6.6 Kiểm soát Đồng thời & Ngân sách Thời gian chờ (Timeout Budget)

- Khi Cron thực thi mỗi phút, hãy áp dụng giới hạn đồng thời cho danh sách Monitor (mặc định là 5), để tránh vượt quá giới hạn kết nối outbound của Workers.
- Cài đặt tổng ngân sách (total budget) cho toàn bộ vòng quét (ví dụ 50s), nếu vượt quá thì ghi nhận là UNKNOWN và để dành cho vòng quét tiếp theo.
- Sử dụng `AbortController` / trình bao bọc (wrapper) thời gian chờ để đảm bảo fetch và socket không bị treo.

### 6.7 Thăm dò Đa khu vực (Multi-region probing) (Mở rộng cho v1+)

v0.x chỉ có "đầu dò đơn" (single-probe) (Cron thực thi tại một vị trí nào đó). Sau này có thể mở rộng:

- Thăm dò từ xa thông qua Worker / Durable Object (để thu thập độ trễ từ các vùng/trung tâm dữ liệu khác nhau).
- API đầu dò ngoài (External probe API) (Tùy chọn, không phải phụ thuộc mặc định).

### 6.8 Quy trình Thực thi Trình lập lịch (scheduled / Cron tick)

Khuyến nghị cấu hình Cron kích hoạt mỗi phút một lần (`* * * * *`), nhưng điều đó không có nghĩa là quét toàn bộ tất cả monitor mỗi phút; Uptimer nên thực hiện "thăm dò khi đến hạn" dựa vào `interval_sec`.

Quy trình đề xuất:

1. Căn chỉnh lát cắt thời gian hiện tại: `checked_at = floor(now / 60) * 60` (Dùng để loại bỏ trùng lặp, tính toán biểu đồ và cửa sổ thời gian).
2. Lấy khóa phân tán (distributed lock) (để ngăn các lượt scheduled chồng chéo):
   - Triển khai một lease có thời hạn (ví dụ 55s) bằng bảng `locks` của D1, nếu không lấy được khóa thì thoát ngay lập tức.
3. Kéo danh sách chờ thăm dò:
   - `monitors.is_active = 1`
   - `monitor_state.status != 'paused'`
   - `monitor_state.last_checked_at IS NULL OR last_checked_at <= now - interval_sec`
4. Thực hiện thăm dò với mức độ đồng thời được kiểm soát:
   - HTTP: Tắt bộ đệm + Thời gian chờ + (Tùy chọn) Xác nhận keyword trong body
   - TCP: `cloudflare:sockets` connect + Thời gian chờ
   - Nhanh chóng thử lại khi thất bại, kết hợp với các ngưỡng thành công/thất bại liên tiếp để cập nhật máy trạng thái.
5. Ghi vào D1 (Nên dùng `DB.batch()` để đảm bảo tính nguyên tử khi cập nhật trạng thái của cùng một monitor):
   - Chèn `check_results` (Chuỗi dữ liệu ngắn hạn)
   - Upsert `monitor_state` (Trạng thái hiện tại)
   - Bảo trì `outages` (Mở/đóng các khoảng thời gian khi trạng thái thay đổi)
6. Kích hoạt thông báo:
   - Chỉ gửi `monitor.down`/`monitor.up` khi "trạng thái thay đổi và không nằm trong thời gian bảo trì".
   - Sử dụng khóa duy nhất của `notification_deliveries` để loại bỏ trùng lặp, tránh gửi cảnh báo lặp.
   - Nếu cần rút ngắn thời gian chạy của một vòng duy nhất, có thể dùng `ctx.waitUntil()` để gửi thông báo không đồng bộ.

Tùy chọn: Ghi lại vị trí thực thi của vòng hiện tại (colo/region) để hiển thị "vị trí đầu dò hiện tại" và khắc phục sự cố (ví dụ bằng cách request `https://cloudflare.com/cdn-cgi/trace` để phân tích `colo=`).

### 6.9 Free Plan CPU Profile (Đường Cơ sở Phát hành Hiện tại)

Đường cơ sở phát hành cuối cùng của Issue #24 đã có sự tối ưu hóa đặc biệt nhằm vào ngân sách `10ms CPU` của Cloudflare Free Plan:

- Hàm bao bọc (wrapper) `scheduled` chỉ thực hiện điều phối nhẹ; quá trình thăm dò thực tế được chia nhỏ thành các invocation con thông qua `POST /api/v1/internal/scheduled/check-batch`.
- Lệnh check-batch trong trường hợp đã sở hữu scheduler lease và chỉ có chunk duy nhất sẽ sử dụng mô hình trusted scheduler lease, nhằm tránh lặp lại D1 batch/monitor lock long-tail.
- monitor runtime updates sẽ được thu gom trước thành dạng compact updates, sau đó dùng một bulk writer duy nhất để ghi các runtime update fragments.
- public homepage/status sẽ tiếp tục dùng D1 static pre-computed snapshot; không sử dụng live compute làm nhánh chính của public API.
- homepage/status snapshot sử dụng D1 fragments cho các bước: seed, raw JSON assemble, continuation publish.
- HTML monitor preload card của `homepage:artifact` được kết xuất trước trong quá trình fragment seed, artifact publish chỉ nối các fragments đã được kết xuất trước lại với nhau.
- Tắt mặc định các scheduled summary logs thông thường; chỉ giữ lại warnings/errors.

Bằng chứng kiểm tra phát hành xem tại `Develop/Worker-CPU-10ms-Release-Readiness.md`. `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED` bị từ chối không thuộc về đường cơ sở phát hành.

---

## 7. Mô hình Dữ liệu (D1 Schema Strategy)

Mục tiêu:

- Truy vấn cấu hình và trạng thái hiện tại phải nhanh (danh sách trang quản trị, tổng hợp trang trạng thái).
- Dữ liệu lịch sử "đủ dùng và kiểm soát được": Đồ thị cần độ phân giải cao trong ngắn hạn, SLA cần có thể tính toán được trong dài hạn.

### 7.1 Bảng và Trách nhiệm

Giải thích: Trong SQLite/D1, kiểu `BOOLEAN` tương đương với số nguyên; khuyên dùng `INTEGER`(0/1) + ràng buộc CHECK một cách nhất quán.

```sql
-- Cấu hình Monitor
CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp')),
  target TEXT NOT NULL, -- http(s)://... hoặc host:port

  interval_sec INTEGER NOT NULL DEFAULT 60 CHECK (interval_sec >= 60),
  timeout_ms   INTEGER NOT NULL DEFAULT 10000 CHECK (timeout_ms >= 1000),

  -- Cấu hình HTTP-only (JSON dùng TEXT để lưu, tầng ứng dụng sẽ validation)
  http_method TEXT,
  http_headers_json TEXT,
  http_body TEXT,
  expected_status_json TEXT, -- ví dụ: [200,204,301]
  response_keyword TEXT,
  response_forbidden_keyword TEXT,

  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- Trạng thái hiện tại của monitor (dùng để đọc nhanh; được Scheduler cập nhật)
CREATE TABLE IF NOT EXISTS monitor_state (
  monitor_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('up','down','maintenance','paused','unknown')),
  last_checked_at INTEGER,
  last_changed_at INTEGER,
  last_latency_ms INTEGER,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_successes INTEGER NOT NULL DEFAULT 0
);

-- Bản ghi thăm dò ngắn hạn (dành cho thanh nhịp tim/đồ thị độ trễ), nên giữ 24h~7d, tùy chỉnh theo quy mô
CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  checked_at INTEGER NOT NULL, -- unix seconds
  status TEXT NOT NULL CHECK (status IN ('up','down','maintenance','unknown')),
  latency_ms INTEGER,
  http_status INTEGER,
  error TEXT,
  location TEXT, -- Tùy chọn: colo/region
  attempt INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time
  ON check_results(monitor_id, checked_at);

-- Các khoảng thời gian lỗi (Lưu giữ lâu dài, dùng cho SLA và sự kiện lịch sử)
CREATE TABLE IF NOT EXISTS outages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER, -- NULL biểu thị vẫn đang trong lỗi
  initial_error TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outages_monitor_start
  ON outages(monitor_id, started_at);

-- Các sự kiện cộng đồng (Có thể tạo thủ công, cũng có thể tự động tạo từ outages)
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('investigating','identified','monitoring','resolved')),
  impact TEXT NOT NULL DEFAULT 'minor' CHECK (impact IN ('none','minor','major','critical')),
  message TEXT, -- Chú thích đầu tiên
  started_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL,
  status TEXT CHECK (status IN ('investigating','identified','monitoring','resolved')),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);
CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_time
  ON incident_updates(incident_id, created_at);

-- Liên kết Incident và monitors (Nhiều-Nhiều; để trạng thái trang hiển thị phạm vi ảnh hưởng)
CREATE TABLE IF NOT EXISTS incident_monitors (
  incident_id INTEGER NOT NULL,
  monitor_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  PRIMARY KEY (incident_id, monitor_id)
);
CREATE INDEX IF NOT EXISTS idx_incident_monitors_monitor
  ON incident_monitors(monitor_id);

-- Cửa sổ bảo trì (Không gửi cảnh báo DOWN trong khi bảo trì, có thể hiện lên trang trạng thái)
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- Liên kết cửa sổ bảo trì và monitors (Nhiều-Nhiều; "kìm hãm cảnh báo" & hiển thị trang trạng thái)
CREATE TABLE IF NOT EXISTS maintenance_window_monitors (
  maintenance_window_id INTEGER NOT NULL,
  monitor_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  PRIMARY KEY (maintenance_window_id, monitor_id)
);
CREATE INDEX IF NOT EXISTS idx_maintenance_window_monitors_monitor
  ON maintenance_window_monitors(monitor_id);

-- Kênh thông báo (Hỗ trợ Webhook, Email, Telegram)
CREATE TABLE IF NOT EXISTS notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('webhook', 'email', 'telegram')),
  config_json TEXT NOT NULL, -- Cấu trúc cấu hình JSON cụ thể cho Webhook/Email/Telegram
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- Hồ sơ gửi thông báo (dùng để bỏ trùng/kiểm toán/kiểm tra gửi lại)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL, -- ví dụ: monitor:12:down:1700000000
  channel_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failed')),
  http_status INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_event_channel
  ON notification_deliveries(event_key, channel_id);

-- Cài đặt gọn nhẹ/chìa khóa tham chiếu (Giá trị nhạy cảm nên dùng Workers Secrets; DB chỉ lưu không nhạy cảm)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Phân phối khóa (để không chạy đè scheduled)
CREATE TABLE IF NOT EXISTS locks (
  name TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Public API tĩnh snapshot (fast path của homepage/status/homepage:artifact)
CREATE TABLE IF NOT EXISTS public_snapshots (
  key TEXT PRIMARY KEY,
  generated_at INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- Guard state/version public snapshot (chứng minh fast guard state còn tồn tại qua các Worker isolate)
CREATE TABLE IF NOT EXISTS public_snapshot_guard_versions (
  key TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  state_json TEXT
);

-- Public snapshot fragments (D1-first phân mảnh qua seed/assemble/publish)
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

### 7.2 Lưu giữ và Dọn dẹp Dữ liệu (Retention)

Khuyến nghị mặc định (Có thể định dạng):

- `check_results`: Giữ 7 ngày gần nhất (hoặc ngắn hơn, vd 24h), dùng cho đồ thị và thanh nhịp tim.
- `outages` / `incidents`: Giữ 90 ngày hoặc xa hơn (dữ liệu nhỏ).
- Lệnh dọn dẹp hàng ngày (Cron): Xoá dữ liệu `check_results` đã hết hạn; tuỳ chọn tạo file nén (archiving) cho `outages`.

### 7.3 Schema Truy Vấn và Tính SLA/Đồ Thị

Thanh Nhịp Tim (Heartbeat Bar - N lần chạy gần nhất):

- Truy vấn: Quét theo `checked_at DESC` cho ra N `check_results` gần nhất (vd: 60).
- Biểu diễn: UP=Xanh lá, DOWN=Đỏ, MAINTENANCE=Xanh dương, UNKNOWN=Xám.

Biểu Đồ Độ Trễ (Latency Chart - Chuỗi thời gian):

- Truy vấn: Lấy `check_results.latency_ms` trong một khung thời gian cụ thể (Chỉ tính khi `status=up` hoặc được đánh dấu là `down`).
- P95: SQLite/D1 không có hàm percentile trực tiếp, v0.x sẽ giải quyết trên Worker bằng cách sắp xếp (Khung thời gian khuyên dùng <= 7d).

Thời Gian Khả Dụng / SLA (Uptime):

- Các cửa sổ đo lường dài ngày ưu tiên dựa vào `outages` để đếm ra thời gian `downtime` (Hiệu quả cho lưu trữ hơn so với giữ toàn bộ heartbeat):
  - Lấy phần thời gian ngắt (outage) giao với khoảng `[rangeStart, rangeEnd)` đo lường theo giây, rồi tổng hợp tất cả.
  - `uptime = 1 - downtime / (rangeEnd - rangeStart)`
  - Ý nghĩa của UNKNOWN cần được xác định rõ (Đề xuất bản v0.x xử lí "UNKNOWN được xem là không khả dụng/mất kết nối", và giao diện hiển thị tỷ lệ `% Unknown` riêng).

---

## 8. Thiết Kế API (REST API)

### 8.1 Quy Chuẩn

- Base path (Đường dẫn gốc): `/api/v1`
- Content-Type: `application/json; charset=utf-8`
- Time (Thời gian): Chỉ sử dụng unix seconds (số nguyên).
- Định dạng báo lỗi (Thống nhất):

```json
{ "error": { "code": "INVALID_ARGUMENT", "message": "..." } }
```

### 8.2 Xác Thực (Auth) & Phân Đoạn

- Public API: Đọc cho các trang trạng thái, không cần xác thực (nhưng có thể cache).
- Admin API: Xác định bằng `Authorization: Bearer <ADMIN_TOKEN>` (token trữ ở Workers Secret).
- Môi trường Product nên thêm Cloudflare Access (SSO) để bao bọc các `/admin` & `/api/v1/admin/*`, làm lớp "khiên bên ngoài", và giữ nguyên logic xác thực gốc của App.

### 8.3 Cấu trúc Endpoint

Dạng Public:

- `GET /api/v1/public/homepage`: Homepage JSON tổng; Ưu tiên lấy từ kết quả đã cập nhật ở `public_snapshots.homepage` / fragments.
- `GET /api/v1/public/homepage-artifact`: HTML preload artifact của Pages; Trả về `preload_html` + `snapshot`.
- `GET /api/v1/public/status`: Kết quả tổng hợp chung, Component List, Báo cáo lỗi mở, Thời gian bảo trì, Nhịp tim & Latency (Đầu tiên tại Trang trạng thái).
- `GET /api/v1/public/monitors/:id/latency?range=24h`: Latency array (Hạn chế tuỳ đối tượng).
- `GET /api/v1/public/monitors/:id/uptime?range=24h|7d|30d`: Số liệu SLA (Downtime bằng s và tỉ lệ Unknown).
- `GET /api/v1/public/incidents?limit=20`: Danh sách event sự cố cũ.
- `GET /api/v1/public/maintenance-windows?limit=20`: Danh sách bảo trì.

Dạng Admin:

- `GET /api/v1/admin/monitors`
- `POST /api/v1/admin/monitors`
- `PATCH /api/v1/admin/monitors/:id`
- `DELETE /api/v1/admin/monitors/:id`
- `POST /api/v1/admin/monitors/:id/test`: Bắt buộc dò ngay lập tức (không lưu hay dán mác manual).

- `GET /api/v1/admin/incidents`
- `POST /api/v1/admin/incidents`
- `POST /api/v1/admin/incidents/:id/updates`
- `PATCH /api/v1/admin/incidents/:id/resolve`
- `DELETE /api/v1/admin/incidents/:id`

- `GET /api/v1/admin/maintenance-windows`
- `POST /api/v1/admin/maintenance-windows`
- `PATCH /api/v1/admin/maintenance-windows/:id`
- `DELETE /api/v1/admin/maintenance-windows/:id`

- `GET /api/v1/admin/notification-channels`
- `POST /api/v1/admin/notification-channels`
- `PATCH /api/v1/admin/notification-channels/:id`
- `DELETE /api/v1/admin/notification-channels/:id`
- `POST /api/v1/admin/notification-channels/:id/test`

Dạng Internal (Dùng với Token Bearer + Cờ (Feature flag); scheduled/service-binding có xài, không thuộc Public API cho App):

- `POST /api/v1/internal/scheduled/check-batch`
- `POST /api/v1/internal/write/runtime-update-fragments`
- `POST /api/v1/internal/refresh/runtime-fragments`
- `POST /api/v1/internal/seed/sharded-public-snapshot`
- `POST /api/v1/internal/assemble/sharded-public-snapshot`
- `POST /api/v1/internal/continue/sharded-public-snapshot`

### 8.4 Phân Trang & Lọc

- Danh sách cho limit mặc định `limit=50`, lớn nhất 200; Xài cơ chế cursor `cursor` (Lọc theo mã `id` hay thời gian `time`) để cho con trỏ cuộn, không dùng offset cho bảng dữ liệu to để tránh trễ.

---

## 9. Dispatcher Hệ Thống Thông Báo (Notification System)

### 9.1 Hệ Loại Sự Kiện

- `monitor.down`: UP -> DOWN (Hoặc UNKNOWN -> DOWN)
- `monitor.up`: DOWN -> UP
- `incident.created` / `incident.updated` / `incident.resolved`
- `maintenance.started` / `maintenance.ended` (Tuỳ chọn)

### 9.2 Tiêu Chuẩn Payload của Webhook (Khuyến Nghị)

```json
{
  "event": "monitor.down",
  "event_id": "monitor:12:down:1700000000",
  "timestamp": 1700000000,
  "monitor": {
    "id": 12,
    "name": "API",
    "type": "http",
    "target": "https://api.example.com/health"
  },
  "state": {
    "status": "down",
    "latency_ms": 10000,
    "http_status": 0,
    "error": "Timeout after 10000ms",
    "location": "HKG"
  },
  "links": {
    "status_page": "https://status.example.com",
    "admin": "https://status.example.com/admin"
  }
}
```

Mẫu `config_json` của Webhook Channel (Gợi ý):

```json
{
  "url": "https://example.com/webhook",
  "method": "POST",
  "headers": { "Authorization": "Bearer xxx" },
  "timeout_ms": 5000,
  "payload_type": "json",
  "signing": {
    "enabled": false,
    "secret_ref": "UPTIMER_WEBHOOK_SIGNING_SECRET"
  }
}
```

Các thuộc tính `config_json` của Telegram Channel:

```json
{
  "bot_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "chat_id": "-100123456789",
  "message_template": "Mẫu tin nhắn tùy chọn",
  "enabled_events": ["monitor.down", "monitor.up"]
}
```

Các thuộc tính `config_json` của Email Channel:

```json
{
  "provider": "resend", // hoặc "sendgrid"
  "api_key": "re_xxxxxx", // Resend hoặc SendGrid API key
  "from": "alerts@yourdomain.com",
  "to": "admin@yourdomain.com",
  "subject_template": "Tiêu đề thư tùy chọn",
  "message_template": "Mẫu nội dung thư tùy chọn",
  "enabled_events": ["monitor.down", "monitor.up"]
}
```

Bảo mật Signing (Tuỳ chọn):

- Nếu bật signing, sẽ bổ sung những header khi gửi:
  - `X-Uptimer-Timestamp: <unix seconds>`
  - `X-Uptimer-Signature: sha256=<hmac>` (Tính mã HMAC-SHA256 trên phần nội dung `timestamp + "." + rawBody`)
- Mục đích: Cung cấp bằng chứng cho nguồn và cấm việc thực hiện lại (Replay-attacks) (bên nhận phải check dấu thời gian nằm trong đoạn hợp lệ).

### 9.3 Chống Trùng (Deduplication) và Lặp Lại

- Tính ổn định được bảo đảm qua thuộc tính `event_id`/`event_key`: 1 sự kiện đưa qua 1 Kênh duy nhất sẽ không bị đẩy đi 2 lần (Khoá với ràng buộc UNIQUE ở `notification_deliveries`).
- Kênh Retry (Làm lại nếu Lỗi): Bản v0.x sẽ chỉ chạy kiểu làm lại "Số lần lặp + Tỉ lệ cấp số nhân lui (Exponential backoff)" (VD: 3 Tần số: 0s/10s/60s); Cơ chế chắc chắn nhất sẽ được cài là Cloudflare Queues (Đợi các cập nhật tương lai).

---

## 10. Hệ Thống Sự Cố (Incident Management)

### 10.1 Loại Sự Cố & Vòng Đời Hoạt Động

- Loại Incident: `Issue` (Hư hỏng), `Maintenance` (Đang sửa)
- Tình trạng trạng thái (Status): Investigating (Kiểm định) -> Identified (Nhận dạng) -> Monitoring (Đang giám sát) -> Resolved (Khắc phục)

### 10.2 Trạng Thái Kết Nối Cùng Monitor

- v0.x Không cần phải quản lý sự gắn bó (Relation) khó: Mặc định sự kiện ghi vào Text báo độ bao phủ là được.
- v0.2+ Đề nghị tích hợp tính năng incident với monitors chung theo đa hướng (N-N): Có thể báo mảng `monitor_ids` dính tới 1 hay nhiều đối tượng trên trạng thái công cộng.
- v1 Gộp lên cho Mảng component (N-N), với mô hình Dashboard tổng quan có thể phân luồng.

---

## 11. Yêu cầu UI/UX Nhất định

Với Public Statuspage (Bắt chước giống UX của Statuspage):

- Header thông báo lỗi lớn Banner (All Operational / Partial Outage / Major Outage / Maintenance).
- Chỉ số Từng Phân Khu / Component: Tình trạng cụ thể của mạng + Nhịp tim kiểm tra của hệ + Biểu đồ thời gian báo Delay rút gọn.
- Đầu Trang liệt kê Unresolved Incident; Phân khu cuối trang cho lịch sử Incident.

Quy định Gom Tình Trạng Hiện Thời (v0.x Suggestion, Có thể tinh chỉnh):

- Đơn Monitor: Thuộc tính `monitor_state.status` ảnh hưởng tới khối màu (up/down/maintenance/unknown/paused).
- Trạng Thái Banner Cao Nhất:
  - Trường hợp tồn tại các Incident lỗi làm bằng tay (`incidents.status != resolved`), Sẽ xem ở `impact` và cập nhật thông báo (Bao gồm nội dung tóm gọn event đó).
  - Không tồn tại thì gom báo theo tổng kết Monitor: Tồn tại 1 Monitor DOWN => Ghi Partial; Quá trình DOWN vượt % Threshold (Ví dụ 30%) => Ghi Major; Chỉ báo có MAINTENANCE => Ghi Maintenance; Tất cả xanh => All Operational.

Khu Quản Trị (Nhắm cho Uptime Kuma UX):

- List Monitor: Khai báo tình trạng, kết quả cuối cùng, lý do bị rớt và Delay/Ping.
- Wizard thiết lập Monitor: Phân luồng riêng cho HTTP hay TCP.
- Công cụ Sửa Event: Tuỳ chọn với Markdown.
- Kiểm tra tính năng Kênh: Nhấn thử Test cho tín hiệu webhook đi xa.

---

## 12. Thông Tin Bảo Mật (Security)

### 12.1 Quản Trị Cấp Cao

- Xác Thực API: Sử dụng Bearer Token (Phải ở bên trong hệ Cloudflare Workers Secret; TUYỆT ĐỐI không ném lên Git và không quăng xuống Database D1).
- Màng Bảo Vệ Cho Production: Mở chế độ của Cloudflare Access (Tuỳ chọn nhưng cực lực đề xuất).

### 12.2 Ngăn Lạm Dụng Input (SSRF/Port Abuse)

Những thuộc tính cho Monitor được coi là một khả năng đánh luồng (outbound SSRF). Vì vậy, bảo vệ và hạn chế là yêu cầu kiên quyết:

- Giao Thức (Protocol) Giới Hạn: Gói HTTP(S) hoặc TCP thô; Đóng việc mở `file://`, `ftp://`.
- Cổng (Port): Hiện nay được nới (Dải từ 1-65535). Ghi Nhớ: Cái này sẽ mở khả năng bị lợi dụng quét cổng ngoài nên Môi trường chạy chính thức PHẢI đi kèm công cụ tường lửa ngoài của CF.
- Cấm Mạng Nội Bộ (Tuỳ Chọn): Đóng các khối địa chỉ LAN / Private (10.0.0.0/8, 192.168.0.0/16, 127.0.0.0/8, ::1 ...), chống tình huống nhắm thẳng LAN nội bộ.
- API Ngăn Chặn SPAM Request ở Dashboard (Lựa chọn xài Cloudflare WAF / Hệ quản trị IP Rate Limit).

### 12.3 Audit Logs (Lịch sử)

- Bản v0.x: Bắt buộc Log những hoạt động mang tính tác động lớn (Như config Update từ monitor/incident/webhook) đẩy vô trong Worker Log (Log Môi Trường Ảo CF).
- Bản v1: Đưa Log vô Bảng ghi hệ thống DB `audit_logs` (Mở tính năng Tuỳ Chọn).

---

## 13. Môi Trường Chạy/DevOps

### 13.1 Dev Ở Local (Local-Dev)

- Nhánh Backend: Sử dụng `wrangler dev` (chạy trên kết quả mô phỏng D1 của SQLite), giúp mô phỏng `fetch` và bộ chạy lịch `scheduled`.
- Nhánh Frontend: Chạy Vite dev server; Config `vite.config` dẫn (proxy) toàn bộ truy vấn đường `/api` đẩy lên API của hệ Worker Local.

### 13.2 CI/CD & Auto Deploy

Tích hợp với GitHub Actions mạnh:

- Lệnh Frontend: build xong -> deploy lên Cloudflare Pages
- Lệnh Backend: Mở lệnh `wrangler deploy`
- Lệnh D1: Chạy migrate `wrangler d1 migrations apply <db> --remote`

### 13.3 Các Tham số Trong file `wrangler.toml` (Example)

```toml
name = "uptimer"
main = "src/index.ts"
compatibility_date = "2026-01-28"
minify = true

[triggers]
crons = ["* * * * *", "0 0 * * *", "30 0 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "uptimer"
database_id = "<uuid>"

[vars]
ADMIN_RATE_LIMIT_MAX = "60"
ADMIN_RATE_LIMIT_WINDOW_SEC = "60"
UPTIMER_SCHEDULED_STATUS_REFRESH = "1"
UPTIMER_TRUST_SCHEDULED_RUNTIME_UPDATES = "1"
UPTIMER_INTERNAL_SCHEDULED_BATCH_SIZE = "2"
# Free Plan CPU profile: xem Develop/Worker-CPU-10ms-Release-Readiness.md
UPTIMER_PUBLIC_MONITOR_UPDATE_FRAGMENT_WRITES = "1"
UPTIMER_SCHEDULED_RUNTIME_FRAGMENT_REFRESH = "1"
UPTIMER_PUBLIC_SHARDED_FRAGMENT_SEED = "1"
UPTIMER_SCHEDULED_SHARDED_FRAGMENT_SEED = "1"
UPTIMER_PUBLIC_SHARDED_ASSEMBLER = "1"
UPTIMER_SCHEDULED_SHARDED_ASSEMBLER = "1"
UPTIMER_PUBLIC_SHARDED_SNAPSHOT_PUBLISH = "1"
UPTIMER_SCHEDULED_SHARDED_PUBLISH = "1"
UPTIMER_PUBLIC_HOMEPAGE_ARTIFACT_FRAGMENT_WRITES = "1"
UPTIMER_SHARDED_ASSEMBLER_MODE = "json"
UPTIMER_SCHEDULED_SHARDED_SKIP_HOMEPAGE_REFRESH = "1"
UPTIMER_SCHEDULED_SHARDED_CONTINUATION = "1"
UPTIMER_SHARDED_FRAGMENT_SEED_BATCH_SIZE = "4"
UPTIMER_SHARDED_RUNTIME_UPDATE_BATCH_SIZE = "5"
UPTIMER_INTERNAL_SCHEDULED_CHECK_BATCH_TIMEOUT_MS = "75000"
UPTIMER_INTERNAL_CHECK_BATCH_FRAGMENT_WRITE_SPLIT = "1"
UPTIMER_INTERNAL_CHECK_BATCH_TRUST_SCHEDULER_LEASE = "1"
UPTIMER_SCHEDULED_REFRESH_LOGS = "0"
```

Cấu hình của `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED` đã được kiểm định làm quá mức CPU cho phép (continuation CPU outliers), nên không được phát hành trong đợt chuẩn hoá.

---

## 14. Tính Theo Dõi Toàn Hệ Thống (Observability)

- Trình lên lịch tự xuất logs (Có JSON Header): In ra session `id`, thông tin % xử lý Monitor, Lỗi/Không lỗi, tốc độ và vị trí colo truy vấn.
- Vấn đề lõi DB & Thông báo: Push một Error Log.
- Phiên bản v1 có khả năng gửi dữ liệu cho Workers Analytics Engine để biểu thị (Nhưng đó là phương án nâng cấp thêm).

---

## 15. Kế Hoạch Đưa Lên Chạy Trực Tiếp (Roadmap)

Bản Phân Đoạn v0.1 (Bản Nền Tảng - MVP):

- Chạy check HTTP/TCP + Thêm bộ Retry với cấu trúc máy trạng thái.
- DB D1 của monitors / monitor_state / check_results / outages đã hoạt động.
- Gửi tín hiệu thông báo Webhook (down/up).
- Cổng Dashboard đơn giản CRUD và Public Pages hiển thị cơ bản.

Bản Phân Đoạn v0.2:

- Cấu trúc Quản trị Lỗi (incidents + biểu diễn Time Line) hiển thị trên Public Pages.
- Cho phép cài Maintenance Windows chặn xuất thông báo lúc rỗi rãi.
- Tự động huỷ Dữ liệu quá tuổi (Xoá data rác 1 lần trong ngày).

Bản Phân Đoạn v0.3+ (Dự Trù Update):

- Dò từ đa hướng địa lí (Nhiều DO hay Node ảo / Server Bắn API từ quốc tế).
- Mở rộng báo hạn chứng chỉ SSL (Chưa có tính năng Core của Worker nào nên buộc xài External API).
- Thêm giao tiếp thông qua Message System quen thuộc (Discord, Telegram..).
- Cấu hình quản trị cao cấp về lưu xuất nhập và phục hồi.

---

## 16. Liên Kết Hỗ Trợ Đính Kèm (References)

- Cron của Cloudflare Workers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Chuẩn truy vấn cho DB D1 (Prepared statements / bind/run): https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- Tối ưu cấu trúc quét trên D1: https://developers.cloudflare.com/d1/best-practices/query-d1/
- Cổng Sockets (TCP/UDP) trên Workers (`cloudflare:sockets`): https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- Bộ nhớ tạm trên Cloudflare: https://developers.cloudflare.com/workers/examples/cache-using-fetch/
- Hono (Workers web framework): https://hono.dev/
- Drizzle ORM: https://orm.drizzle.team/
- React: https://react.dev/
- Vite: https://vitejs.dev/
- React Router: https://reactrouter.com/
- TanStack Query: https://tanstack.com/query/latest
- Tailwind CSS: https://tailwindcss.com/
