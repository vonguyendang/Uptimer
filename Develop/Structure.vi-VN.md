# Structure.md: Cấu trúc Kho lưu trữ (Uptimer)

Bài viết này định nghĩa cấu trúc thư mục, ranh giới các module và quy ước đặt tên cho kho lưu trữ Uptimer, dùng cho việc khởi tạo và đảm bảo tính nhất quán trong quá trình cộng tác sau này.

---

## 1. Thư mục Gốc (Hiện tại)

```
.
├─ apps/
│  ├─ web/                      # Cloudflare Pages: Frontend React + Vite (Quản trị + Trang trạng thái công khai)
│  └─ worker/                   # Cloudflare Workers: API Hono + Công cụ giám sát theo lịch (scheduled)
├─ packages/
│  ├─ shared/                   # Các type/constant/Zod schema dùng chung (Frontend & Backend)
│  └─ db/                       # Drizzle schema và gói truy cập DB (dành cho worker)
├─ Develop/                     # Đặc tả sản phẩm, cấu trúc, kế hoạch, tham chiếu API, ghi chú phát hành
├─ .github/workflows/           # CI/CD (Triển khai Pages + Worker, migrate D1)
├─ AGENTS.md                    # Quy ước cộng tác/hướng dẫn cho Code assistants
└─ reference-project/           # Dự án tham khảo (Chỉ đọc; không phát triển tại đây)
```

Giải thích:

- Kho lưu trữ này sử dụng cấu trúc monorepo để dễ dàng chia sẻ kiểu dữ liệu (types) và thống nhất các dependencies.
- Các tài liệu đặc tả được đặt thống nhất trong `Develop/`; ghi chú về việc giải phóng CPU Issue #24 nằm trong `Develop/Worker-CPU-10ms-Release-Readiness.md`.
- Dự án tham khảo chỉ đọc chỉ dùng để tham khảo cách sử dụng Cloudflare API/Workers; việc triển khai dự án này phải tuân theo `Develop/Application.md`.

---

## 2. Cấu trúc Worker (Backend)

```
apps/worker/
├─ wrangler.toml                # Cấu hình Worker (D1 binding, cron triggers, Free Plan CPU profile)
├─ migrations/                  # D1 SQL migrations (wrangler d1 migrations apply)
└─ src/
   ├─ index.ts                  # Đầu vào Worker: fetch/scheduled/export default
   ├─ fetch-handler.ts          # Tách biệt đầu vào fetch để giảm gánh nặng cho scheduled cold path
   ├─ hono-app.ts               # Hono app và gắn các routes
   ├─ env.ts                    # Env interface (D1 binding, secrets, feature flags)
   ├─ analytics/                # Các hàm trợ giúp tổng hợp latency / uptime
   ├─ internal/                 # Các handler nội bộ cho scheduled/service-binding
   │  ├─ homepage-refresh-core.ts
   │  ├─ runtime-fragments-refresh-core.ts
   │  ├─ sharded-public-snapshot-core.ts
   │  └─ sharded-public-snapshot-continuation.ts
   ├─ middleware/               # auth / errors / public cache / rate limit
   ├─ routes/
   │  ├─ public.ts              # /api/v1/public/* (Toàn bộ public API)
   │  ├─ public-hot.ts          # Đường dẫn nóng cho homepage/status/artifact snapshot
   │  ├─ public-ui*.ts          # Các API hỗ trợ giao diện trạng thái
   │  ├─ admin*.ts              # admin CRUD / settings / analytics / exports
   │  └─ ...
   ├─ scheduler/
   │  ├─ scheduled.ts           # Điều phối scheduled(), kiểm tra hàng loạt, cấu hình CPU
   │  ├─ daily-rollup.ts        # monitor_daily_rollups
   │  ├─ lock.ts / lease-guard.ts
   │  ├─ notifications.ts
   │  └─ retention.ts
   ├─ monitor/                  # Kiểm tra HTTP/TCP, xác thực mục tiêu, máy trạng thái
   ├─ notify/                   # Gửi Webhook, template, loại bỏ trùng lặp (dedupe)
   ├─ observability/            # Các hàm trace/timing (chẩn đoán tắt theo mặc định)
   ├─ public/                   # Tính toán payload homepage/status, runtime snapshot, khả năng hiển thị
   ├─ schemas/                  # Zod schemas cho public/admin/stored payloads
   └─ snapshots/                # Đọc/ghi public_snapshots, fragments, homepage artifact
```

Quy ước:

- Tất cả API đối ngoại đều đi từ `routes/`; các logic không thuộc định tuyến (routing) được đẩy xuống `public/`, `snapshots/`, `internal/`, `scheduler/`, v.v.
- Đầu vào `scheduled()` chỉ chịu trách nhiệm điều phối quy trình và ghi log; các hoạt động như thăm dò (probing), ghi runtime fragment, và xuất bản public snapshot được chia nhỏ thành các invocation con.
- Các route `internal/` chỉ được sử dụng bởi scheduled/service binding, bắt buộc giữ Bearer Token auth và feature flag gating.

---

## 3. Cấu trúc Web (Frontend)

```
apps/web/
├─ public/
├─ index.html
├─ vite.config.ts
└─ src/
   ├─ main.tsx
   ├─ app/
   │  ├─ router.tsx             # Bảng định tuyến React Router
   │  └─ queryClient.ts         # Cấu hình TanStack Query
   ├─ api/
   │  ├─ client.ts              # Đóng gói fetch (baseUrl, xử lý lỗi)
   │  └─ types.ts               # Các kiểu dữ liệu API Frontend (ưu tiên import từ packages/shared)
   ├─ pages/
   │  ├─ StatusPage.tsx         # Trang trạng thái công khai
   │  ├─ AdminLogin.tsx         # Tùy chọn (Chỉ nhập Token/lưu vào localStorage)
   │  └─ AdminDashboard.tsx
   ├─ features/
   │  ├─ monitors/              # Giao diện CRUD cho các mục giám sát
   │  ├─ incidents/             # Giao diện quản lý sự cố
   │  └─ notifications/         # Giao diện quản lý kênh thông báo
   ├─ components/
   ├─ styles/
   └─ utils/
```

Quy ước:

- Các kiểu dữ liệu (types) và schema dùng chung với backend ưu tiên import từ `packages/shared`, tránh việc frontend và backend "mỗi bên viết một bộ".
- Các request API được quản lý tập trung thông qua `api/client.ts`; không rải rác các request `fetch` trần trong các components.

---

## 4. Cấu trúc Shared/DB

```
packages/shared/
└─ src/
   ├─ constants.ts              # Các Enum/hằng số (status, loại event)
   ├─ schemas.ts                # Zod schemas (API input/output, các trường json DB)
   └─ types.ts                  # Kiểu TypeScript (được suy ra từ schema)

packages/db/
└─ src/
   ├─ schema.ts                 # Drizzle table schema (nhất quán với migrations)
   └─ index.ts                  # Xuất các hàm trợ giúp db
```

Quy ước:

- DB schema (Drizzle) và D1 migrations (SQL) phải được thay đổi đồng bộ; bất kỳ thay đổi schema nào đều phải kèm theo một file migration mới.
- Các trường `config_json`, `*_json` sử dụng Zod để kiểm tra tính hợp lệ tại thời điểm chạy (runtime).

---

## 5. Quy ước Đặt tên và Ranh giới

- Route:
  - Public: `/api/v1/public/*`
  - Admin: `/api/v1/admin/*`
- Trường Thời gian:
  - Các API đối ngoại và lưu trữ D1 thống nhất sử dụng unix seconds (INTEGER), tên trường kết thúc bằng `*_at`.
- Trường Trạng thái:
  - DB/Interface thống nhất dùng `up|down|maintenance|paused|unknown`; độ trễ dùng `latency_ms`.
- Không cho phép `apps/web` trực tiếp phụ thuộc vào các API của môi trường chạy Worker (ví dụ: `cloudflare:sockets`).
- Không cho phép chỉnh sửa dự án tham khảo chỉ đọc như một phần của quá trình triển khai (trừ khi có yêu cầu rõ ràng).
