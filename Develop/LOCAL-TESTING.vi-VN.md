# Quy trình kiểm thử cục bộ (Local Testing)

Tài liệu này giới thiệu cách chạy và kiểm thử dự án Uptimer trong môi trường cục bộ (Local).

## Mục lục

1. [Yêu cầu môi trường](#yêu-cầu-môi-trường)
2. [Cài đặt dependencies](#cài-đặt-dependencies)
3. [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
4. [Khởi tạo và chạy bằng một lệnh (Khuyên dùng)](#khởi-tạo-và-chạy-bằng-một-lệnh-khuyên-dùng)
5. [Khởi tạo Database (Thủ công)](#khởi-tạo-database-thủ-công)
6. [Bơm dữ liệu test nhanh (Thủ công)](#bơm-dữ-liệu-test-nhanh-thủ-công)
7. [Chạy Server lập trình (Thủ công)](#chạy-server-lập-trình-thủ-công)
8. [Kiểm tra giao diện API](#kiểm-tra-giao-diện-api)
9. [Kiểm thử tự động (Phủ > 90% kịch bản)](#kiểm-thử-tự-động-phủ-90-kịch-bản)
10. [Kiểm tra chất lượng code](#kiểm-tra-chất-lượng-code)
11. [Các câu hỏi thường gặp](#các-câu-hỏi-thường-gặp)

---

## Yêu cầu môi trường

| Công cụ  | Phiên bản yêu cầu | Mô tả                  |
| -------- | ----------------- | ---------------------- |
| Node.js  | >= 22.14.0        | JavaScript Runtime     |
| pnpm     | >= 10.8.1         | Trình quản lý package  |
| Wrangler | Mới nhất          | Cloudflare Workers CLI |

### Cài đặt pnpm

```bash
npm install -g pnpm@10.8.1
```

### Cài đặt Wrangler

```bash
npm install -g wrangler
```

---

## Cài đặt dependencies

Ở thư mục gốc của dự án, chạy lệnh:

```bash
pnpm install
```

Lệnh này sẽ cài đặt tất cả các thư viện và các mô-đun ở workspace (`apps/web`, `apps/worker`, `packages/*`).

---

## Cấu hình biến môi trường

### Biến môi trường Worker

1. Sao chép file mẫu:

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

2. Chỉnh sửa `apps/worker/.dev.vars`, thêm khóa Token Quản trị viên:

```
ADMIN_TOKEN=your-secure-token-here
```

> **Lưu ý**: File `.dev.vars` đã nằm trong `.gitignore` và sẽ không được lưu vào hệ thống kiểm soát phiên bản.

---

## Khởi tạo và chạy bằng một lệnh (Khuyên dùng)

Ở thư mục gốc của dự án, chạy lệnh:

```bash
pnpm dev
```

Lệnh này sẽ tự động hoàn thành:

- Worker chuyển Database cục bộ thông qua migration (`apps/worker`)
- Bơm dữ liệu mẫu cục bộ (Seed) (bao gồm tất cả các kịch bản với trạng thái và sự cố)
- Cùng lúc khởi chạy các trình máy chủ phục vụ lập trình cho Worker và Web

Địa chỉ mặc định:

- Worker: `http://localhost:8787`
- Web: `http://localhost:5173`

---

## Khởi tạo Database (Thủ công)

Uptimer dùng hệ thống Cloudflare D1 (SQLite) DB. Ở môi trường local, Wrangler sẽ tự động thiết lập một database cục bộ.

### Tạo Database cục bộ và chạy lệnh chuyển (migrate)

```bash
cd apps/worker
wrangler d1 migrations apply uptimer --local
```

### Xác thực xem DB có được tạo không

```bash
wrangler d1 execute uptimer --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Dự kiến sẽ thấy các bảng sau:

- monitors
- monitor_state
- check_results
- outages
- incidents
- incident_updates
- incident_monitors
- maintenance_windows
- maintenance_window_monitors
- notification_channels
- notification_deliveries
- settings
- locks
- monitor_daily_rollups
- public_snapshots

---

## Bơm dữ liệu test nhanh (Thủ công)

Để tăng độ bao phủ trạng thái ở môi trường test Local nhanh gọn (`up/down/maintenance/paused/unknown`) và các kịch bản lỗi, Worker cung cấp một công cụ gieo Seed tự động:

```bash
cd apps/worker
pnpm seed:local
```

Tập script này sẽ đổ dữ liệu mẫu Demo lên khu vực ID được thiết lập trước `900001-900099` (Điều này sẽ không làm mất dữ liệu có ID người dùng tự đặt), kèm:

- 6 đối tượng (HTTP/TCP)
- Những bảng trạng thái `monitor_state` phù hợp, cùng xấp xỉ 60 dữ liệu tim mạch (heartbeat).
- Chu kì lỗi outage đang xảy ra + chu kì outage đã xong.
- Sự cố (incidents) xử lý xong/chưa xong, và các thông tin cập nhật (updates).
- Cửa sổ thời gian bảo trì (active/upcoming).
- Chu kì rollup ở mức 30 Ngày (Hỗ trợ việc thanh Uptime ở Status page và hệ Analytics).

Bạn có thể test bằng câu lệnh nhanh sau đây:

```bash
wrangler d1 execute uptimer --local --command="SELECT id,name,type,target FROM monitors WHERE id BETWEEN 900001 AND 900099 ORDER BY id;"
```

---

## Chạy Server lập trình (Thủ công)

Bạn cần mở 2 cửa sổ/tab ở Terminal (Bảng điều khiển lệnh) vì bạn phải chạy song song ở Frontend và Backend.

### Cửa số Terminal 1: Chạy hệ Worker (Backend)

```bash
cd apps/worker
pnpm dev
```

Worker sẽ khởi chạy tại `http://localhost:8787`.

### Cửa sổ Terminal 2: Chạy hệ Web (Frontend)

```bash
cd apps/web
pnpm dev
```

Frontend khởi tạo ở `http://localhost:5173`, và những Request gửi về API đều tự động thông qua proxy đẩy lên Worker.

---

## Kiểm tra giao diện API

### Public API (Không yêu cầu Xác thực Authentication)

#### Lấy danh sách Monitor Data trạng thái tổng hợp

```bash
curl http://localhost:8787/api/v1/public/status
```

> **Hệ thống tăng tốc Snapshot Trạng thái (Public status snapshot)**: Worker sẽ xuất nội dung của `/api/v1/public/status` rồi in thành bản cứng vào bảng `public_snapshots`.
> Khi đó mọi truy vấn đến nó đều trích nội dung của snapshot trước (Độ trễ cao nhất 60s, đa số <= 30s).

Xác thực tính năng đó:

```bash
wrangler d1 execute uptimer --local --command="SELECT key, generated_at, updated_at, LENGTH(body_json) AS bytes FROM public_snapshots;"
```

#### Lấy số lượng độ trễ của mục Monitor đơn lẻ

```bash
curl http://localhost:8787/api/v1/public/monitors/{id}/latency
```

#### Lấy thống kê khả dụng hoạt động Monitor

```bash
curl http://localhost:8787/api/v1/public/monitors/{id}/uptime
```

#### Nhận Event (Nổi bật các vấn đề chưa hoàn tất trên cùng)

```bash
curl "http://localhost:8787/api/v1/public/incidents?limit=20"
```

### API của Admin (Yêu cầu xác thực Authentication)

Toàn bộ những lời gọi dưới cấp quản trị bắt buộc chèn khóa: `Authorization: Bearer <ADMIN_TOKEN>`.

#### Thiết lập Monitor

```bash
curl -X POST http://localhost:8787/api/v1/admin/monitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "Example Site",
    "type": "http",
    "target": "https://example.com",
    "interval_sec": 60,
    "timeout_ms": 5000
  }'
```

#### Lấy tổng thể số lượng Monitor

```bash
curl http://localhost:8787/api/v1/admin/monitors \
  -H "Authorization: Bearer your-secure-token-here"
```

#### Trích thông số Settings

```bash
curl http://localhost:8787/api/v1/admin/settings \
  -H "Authorization: Bearer your-secure-token-here"
```

#### Chỉnh Cấu hình Settings (PATCH)

```bash
curl -X PATCH http://localhost:8787/api/v1/admin/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "site_title": "My Status",
    "site_description": "Public status page",
    "site_timezone": "Asia/Shanghai",
    "retention_check_results_days": 14,
    "state_failures_to_down_from_up": 3,
    "state_successes_to_up_from_down": 2,
    "admin_default_overview_range": "7d",
    "admin_default_monitor_range": "30d",
    "uptime_rating_level": 4
  }'
```

#### Sửa Thông Số của Monitor

```bash
curl -X PATCH http://localhost:8787/api/v1/admin/monitors/{id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "Updated Name",
    "interval_sec": 120
  }'
```

#### Xóa Monitor

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/monitors/{id} \
  -H "Authorization: Bearer your-secure-token-here"
```

### Các thông báo (Webhook)

#### Thêm một cấu trúc truyền thông tin (Custom templates & biến)

Ví dụ dưới sẽ:

- Áp cấu trúc dạng `payload_type: json`
- Bằng tính năng `message_template`, hỗ trợ in giá trị ra format `{{message}}`
- Thiết lập cách chèn JSON tùy chỉnh khi chuyển đi webhook nhờ `payload_template`.

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "My Webhook",
    "type": "webhook",
    "config_json": {
      "url": "https://example.com/webhook",
      "method": "POST",
      "timeout_ms": 5000,
      "payload_type": "json",
      "message_template": "[{{event}}] {{monitor.name}} => {{state.status}}\\n$MSG",
      "payload_template": {
        "text": "{{message}}",
        "event": "{{event}}",
        "event_id": "{{event_id}}",
        "monitor": {
          "id": "{{monitor.id}}",
          "name": "{{monitor.name}}",
          "target": "{{monitor.target}}"
        }
      },
      "enabled_events": ["monitor.down", "monitor.up"]
    }
  }'
```

#### Nhấn Test thử một webhook (Tính năng chạy render mẫu; với event mặc định test.ping)

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels/{id}/test \
  -H "Authorization: Bearer your-secure-token-here"
```

#### Mở payload_type dạng param (Hỗ trợ GET/POST; có thể ghép payload_template tạo Query Parameters)

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "QueryParam Webhook",
    "type": "webhook",
    "config_json": {
      "url": "https://example.com/webhook",
      "method": "GET",
      "payload_type": "param",
      "payload_template": {
        "event": "{{event}}",
        "monitor": "{{monitor.name}}",
        "msg": "{{message}}"
      }
    }
  }'
```

#### Mở payload_type với định dạng x-www-form-urlencoded

```bash
curl -X POST http://localhost:8787/api/v1/admin/notification-channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "name": "Form Webhook",
    "type": "webhook",
    "config_json": {
      "url": "https://example.com/webhook",
      "method": "POST",
      "payload_type": "x-www-form-urlencoded",
      "payload_template": {
        "event": "{{event}}",
        "msg": "{{message}}"
      }
    }
  }'
```

> Hướng dẫn luật sử dụng những Biến ma thuật (Tóm lược):
>
> - Tương thích cấu trúc cây biến `{{path.to.field}}` hay dạng mảng index `{{arr[0].x}}`
> - Hoạt động cùng chuẩn `$MSG` (Khi render xong sẽ đổi ra "message" - Nội dung truyền đi)
> - `{{message}}` mang theo bản text chèn nội dung hoàn chỉnh; `{{default_message}}` lấy mặc định text trong máy.

### Dò kiểm tra tính năng Lịch công tác tự động (Cron-task)

Trong môi trường Wrangler, các Cron Job có khả năng kích bằng gọi Manual:

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### Tính ổn định của Scheduler - Thực nghiệm ép CPU

Mã lệnh hỗ trợ kiểm tra giả định benchmark thông số của `runScheduledTick`:

```bash
pnpm --filter @uptimer/worker bench:scheduler
```

Cấu trúc mặc định nó sẽ tự tìm file của bản gốc (`HEAD`) phân tích, hỗ trợ việc dò tính tương đồng của hiệu quả mã trước khi commit (uncommitted files).

Khi muốn đưa nó vô đối chiếu 1 mốc nào cụ thể (Ví dụ test cho `origin/master` hoặc 1 commit hash nào đó), ghi đè cờ benchmark ref vào:

```bash
SCHEDULER_BENCH_BASE_REF=origin/master pnpm --filter @uptimer/worker bench:scheduler
SCHEDULER_BENCH_BASE_REF=ee9207b pnpm --filter @uptimer/worker bench:scheduler
```

Bảng tham số lựa chọn (Optional parameters):

```bash
SCHEDULER_BENCH_RUNS=20 SCHEDULER_BENCH_WARMUPS=5 pnpm --filter @uptimer/worker bench:scheduler
SCHEDULER_BENCH_WRITE_JSON=./scheduler-bench.json pnpm --filter @uptimer/worker bench:scheduler
```

Giải thích thuật ngữ:

- Điểm cơ sở để xem lại CPU và tổng chi phí của Schedule + Cơ chế vận chuyển của D1 Database.
- HTTP/TCP probe đã được giả lập lại (mock), phòng trừ vấn đề của Delay mạng ảnh hưởng mức chịu tải của kết quả.
- Đếm tần số xuất hiện của lệnh `DB.batch()` hỗ trợ bạn nhìn rõ quá trình Bulk Writes đã diễn ra hiệu quả ra sao.

---

## Phase 8/9: Các bước xem tính khả thi trong quản trị Sự Cố/Sự Kiện và Khung giờ Bảo Trì

### 1) Tạo mới 1 Sự Cố Mạng (incident.created)

```bash
curl -X POST http://localhost:8787/api/v1/admin/incidents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "title": "API outage",
    "impact": "major",
    "status": "investigating",
    "message": "We are investigating.",
    "monitor_ids": [1]
  }'
```

### 2) Thêm thông tin giải quyết Sự cố mạng (incident.updated)

```bash
curl -X POST http://localhost:8787/api/v1/admin/incidents/1/updates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "status": "monitoring",
    "message": "Mitigation applied, monitoring."
  }'
```

### 3) Khép lại/Xác nhận Fix Thành công 1 sự cố mạng (incident.resolved)

```bash
curl -X PATCH http://localhost:8787/api/v1/admin/incidents/1/resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{ "message": "Resolved." }'
```

### 3.1) Xóa vĩnh viễn 1 Sự Cố khỏi CSDL (admin delete)

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/incidents/1 \
  -H "Authorization: Bearer your-secure-token-here"
```

### 4) Cài đặt cấu hình Tắt Cảnh báo khi có khoảng trống cho việc Bảo Trì (maintenance window)

```bash
# starts_at/ends_at định dạng unix seconds (Số kiểu nguyên)
curl -X POST http://localhost:8787/api/v1/admin/maintenance-windows \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{
    "title": "DB maintenance",
    "message": "Planned maintenance.",
    "starts_at": 1700000000,
    "ends_at": 1700003600,
    "monitor_ids": [1]
  }'
```

### 4.1) Xóa 1 Khung giờ làm bảo trì

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/maintenance-windows/1 \
  -H "Authorization: Bearer your-secure-token-here"
```

---

## Phase 10: Lấy báo cáo Thống Kê & Phân Tích (Analytics) (Test Rút gọn)

> Chi tiết nhỏ: Bộ test này sẽ phải gọi tới `monitor_daily_rollups` (bảng thông tin đã được đóng kiện thành cấp Ngày Rollups) lúc bạn dùng chức năng Analytics (7d/30d/90d).
> Ở môi trường Local, sẽ cần thiết có một bước gọi daily cron cho tạo kết quả Rollup của "ngày hôm trước".

### 0) Thực thi các lệnh áp dụng Rollup bảng ở các Migrations mới nhất

```bash
cd apps/worker
wrangler d1 migrations apply uptimer --local
```

### 1) Kích lệnh để chạy hệ thống tổng kết Daily Rollup (Đẩy số hôm qua vào trong cơ sở)

```bash
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

### 2) Bảng Admin: Báo cáo khái quát theo (24h/7d)

```bash
curl "http://localhost:8787/api/v1/admin/analytics/overview?range=24h" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 3) Bảng Admin: Trích cho một Monitor chuyên biệt (24h/7d/30d/90d)

```bash
curl "http://localhost:8787/api/v1/admin/analytics/monitors/1?range=24h" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 4) Bảng Admin: In mảng dữ liệu khi rớt mạng của hệ thống (sử dụng limit/cursor)

```bash
curl "http://localhost:8787/api/v1/admin/analytics/monitors/1/outages?range=7d&limit=50" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 4.1) Bảng Admin: Test thử việc Xuất mảng File CSV (Tùy chọn)

```bash
# outages (Khoảng đen sự cố)
curl -L "http://localhost:8787/api/v1/admin/exports/monitors/1/outages.csv?range=30d" \
  -H "Authorization: Bearer your-secure-token-here"

# check_results (Số liệu nhịp tim, thông qua lưu trữ cho phép - default = 24h/7d)
curl -L "http://localhost:8787/api/v1/admin/exports/monitors/1/check-results.csv?range=24h" \
  -H "Authorization: Bearer your-secure-token-here"

# incidents (Báo cáo sự cố toàn trang)
curl -L "http://localhost:8787/api/v1/admin/exports/incidents.csv?range=90d" \
  -H "Authorization: Bearer your-secure-token-here"
```

### 5) Ở mức độ Public View: Xem nhanh Khả dụng của API / 30d/90d (Trang Status Load siêu nhẹ)

```bash
curl "http://localhost:8787/api/v1/public/analytics/uptime?range=30d"
```

## Kiểm thử tự động (Phủ > 90% kịch bản)

Tất cả thành phần Backend / Logic (Hệ trạng thái, Target Validate, Thuật toán thời gian Uptime, Thuật toán độ chia Histogram Latency, và cấu trúc Notify) đã được chuẩn hoá (Coverage Check >= 90%, và hệ logic nhánh - branch >= 85%).

Trong trang chủ Local bạn chạy lệnh:

```bash
pnpm test
```

Và khi muốn làm chạy mức test đơn lẻ của phần hệ thống Worker:

```bash
pnpm --filter @uptimer/worker test
```

Thư mục lưu trữ:

- `apps/worker/test/monitor-state-machine.test.ts`
- `apps/worker/test/monitor-targets.test.ts`
- `apps/worker/test/analytics-uptime.test.ts`
- `apps/worker/test/analytics-latency.test.ts`
- `apps/worker/test/notify-template.test.ts`

## Kiểm tra chất lượng code

### Dò cấu trúc định hình (Type check)

Xem độ tương thích về kiểu biến Typescript qua:

```bash
pnpm typecheck
```

### Dò tính hoàn thiện / Chuẩn Style (Code style check)

Check chuẩn code của dự án ESLint:

```bash
pnpm lint
```

### Fix Chuẩn Định Đạng Format

Phân tích Format code:

```bash
pnpm format:check
```

Chữa lại mọi lỗi do Format Code:

```bash
pnpm format
```

---

### Khối biểu đồ Uptime ở Trạng thái chung Công Khai (30 ngày Uptime)

Khung Dashboard Uptime ở giao diện cho người ngoài sẽ chạy liên kết và tải thẳng Database Daily (`monitor_daily_rollups`) để đẩy dữ liệu khối ảnh Uptime-Bars cho mỗi hệ thống Monitor.

Nghĩa vụ tạo bản Local (Để xem dữ liệu hôm qua Rollups) bạn gõ:

```bash
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

Bảng Giao diện nó sẽ đẩy tối đa bằng 30 cục nếu DB chứa Data đó. Ngược lại nếu chưa Rollup, nó sẽ để chỗ đó là "trống (empty)".

## Các câu hỏi thường gặp

### Hỏi: Hệ Worker bị lỗi khi khởi chạy, cảnh báo DB không tồn tại.

**Đáp**: Bảo đảm phần lệnh Migration đã hoàn tất. Thử làm thế này:

```bash
cd apps/worker
wrangler d1 migrations apply uptimer --local
```

### Hỏi: Từ phía Client (Frontend) có vấn đề không kết nối vô API được của Backend

**Đáp**: Bạn kiểm định xem phần 1 2:

1. Có chắc Worker port đang live ở `localhost:8787` không?
2. Có file `apps/web/vite.config.ts` Proxy có chạy chưa?

### Hỏi: Đăng nhập từ chối cấp quyền / Error 401 (401 Unauthorized)

**Đáp**: Lưu ý kĩ:

1. `.dev.vars` được viết đúng tên chuẩn + đã chèn Key của `ADMIN_TOKEN`.
2. Có phải Request Header bạn đang bỏ vô chung 1 Token tương đồng của hệ `.dev.vars` không?

### Hỏi: Muốn xóa Trắng dữ liệu ở hệ Local?

**Đáp**: Diệt luôn folder lưu DB local rồi cài DB gốc lại như cũ:

```bash
cd apps/worker
rm -rf .wrangler/state
wrangler d1 migrations apply uptimer --local
```

---

## Tham khảo Kiến Trúc/Thư Mục File Code (Dự Án Local)

```
Uptimer/
├── apps/
│   ├── web/          # React Front-end Code (localhost:5173)
│   └── worker/       # Cloudflare Back-end Code (localhost:8787)
├── packages/
│   ├── db/           # Mã nguồn Schema Database Client
│   └── shared/       # Mã nguồn tái dùng nhiều lần
└── pnpm-workspace.yaml
```
