# Plan.md: Kế hoạch Bàn giao (Uptimer v0.1+)

Kế hoạch phân phối từng giai đoạn từ MVP đến production. Mỗi giai đoạn đều bao gồm tiêu chí chấp nhận (acceptance criteria).

> Các Giai đoạn (Phases) 0–12 đã **hoàn thành**. Vấn đề Issue #24 kết thúc hết thời gian chạy CPU trên Free Plan được phát hành qua PR #77/#78 và được ghi lại trong `Worker-CPU-10ms-Release-Readiness.md`. Xem `REVIEW.md` đối với những khoảng trống còn lại.

---

## Tiêu chuẩn sau phát hành — Đóng Issue #24 CPU (2026-04-29)

Trạng thái: Đã phát hành lên nhánh Main, và đồng bộ với Dev.

Bằng chứng kiểm tra:

- Final controlled Dev Tail: `BAD_OR_GE10 count=0`, tất cả invocation path dưới dạng lấy mẫu đều tuân thủ nghiêm ngặt `<10ms`.
- Production post-release Tail: `BAD_OR_GE10 count=0`.
- Public parity: `/api/v1/public/homepage`, `/api/v1/public/status`, `/api/v1/public/homepage-artifact` đều trả về `200`.

Cấu hình phát hành:

- Cấu hình Free Plan CPU profile đã được ghi vào `apps/worker/wrangler.toml`.
- Homepage/status tiếp tục sử dụng snapshot được tính toán tĩnh trước; không sử dụng tính toán live (live compute) như là luồng API công khai chính.
- Việc thực nghiệm `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED` đã bị từ chối, và không thuộc cấu hình phát hành.

---

## 0. Các Ràng buộc (Đã chốt)

- Nền tảng: Cloudflare Workers + Pages + D1
- Frontend: React + Vite + TypeScript + Tailwind + React Router + TanStack Query + Recharts
- Backend: TypeScript + Hono + Zod
- DB: D1 + Drizzle ORM; công cụ migration sử dụng Wrangler D1 migrations
- Xác thực (Auth): Admin Bearer Token (Workers Secret)

---

## 1. Phase 0 — Khởi tạo Kho lưu trữ (1 Ngày)

Nhiệm vụ:

- Xây dựng cấu trúc thư mục monorepo: `apps/web`, `apps/worker`, `packages/shared`, `packages/db`
- Quản lý các packages thống nhất với Node version:
  - `pnpm` + `pnpm-workspace.yaml`
  - `.nvmrc` / `.node-version` (Khóa phiên bản Node)
- Các công cụ kĩ thuật (Engineering):
  - Cấu hình chuẩn TypeScript (strict)
  - ESLint + Prettier (Front/Back đồng nhất)
  - GitHub Actions: lint + typecheck (Có thể bỏ qua việc triển khai hiện tại)

Tiêu chí chấp nhận (DoD):

- `pnpm -r lint` và `pnpm -r typecheck` chạy tốt (kể cả khi dự án trống)

---

## 2. Phase 1 — Schema & Migrations D1 (1 Ngày)

Nhiệm vụ:

- Dựa trên `Application.md`, tạo migration đầu tiên:
  - `monitors`, `monitor_state`, `check_results`, `outages`
  - `incidents`, `incident_updates`
  - `maintenance_windows`
  - `notification_channels`, `notification_deliveries`
  - `settings`, `locks`
- Thêm các indices cần thiết (như `monitor_id, checked_at`)
- `packages/db`:
  - Định nghĩa Drizzle schema và gói D1 client
  - Cung cấp Zod validation và tiện ích cho các trường `*_json`

Tiêu chí chấp nhận (DoD):

- `wrangler d1 migrations apply` có thể thực thi cho local/remote DB (ít nhất trên local thành công)
- Worker có thể kết nối với D1 và truy vấn thử một lần (healthcheck)

---

## 3. Phase 2 — Khung Worker API (1–2 Ngày)

Nhiệm vụ:

- Phân cấp Hono router:
  - `/api/v1/public/*` (Không cần xác thực)
  - `/api/v1/admin/*` (Sử dụng middleware Bearer Token)
- Thống nhất các kiểu dữ liệu và định dạng lỗi cho input validation (Zod)
- Xây dựng một API tối thiểu:
  - `GET /api/v1/public/status` (Trả về dữ liệu mẫu)
  - `GET /api/v1/admin/monitors` / `POST /api/v1/admin/monitors`

Tiêu chí chấp nhận (DoD):

- Có thể truy cập API bằng trình `wrangler dev` trên local, cơ chế xác thực hoạt động đúng
- Có thể ghi các cấu hình Monitor CRUD vào D1 và đọc lại bình thường

---

## 4. Phase 3 — Engine Giám sát (scheduled) (2–4 Ngày)

Nhiệm vụ:

- Xây dựng `scheduled()` (kích hoạt mỗi phút):
  - Kiểm soát thực thi chống trùng lặp bằng D1 lease lock (Bảng `locks`)
  - Nhận biết các "monitors đến hạn" (dựa trên `interval_sec` và `last_checked_at`)
  - Giới hạn chạy song song (p-limit với mức độ mặc định bằng 5)
- Kiểm tra HTTP:
  - Timeout (Sử dụng AbortController)
  - Vô hiệu hoá cache (`cache: 'no-store'` + `cf.cacheTtlByStatus: { '100-599': -1 }`)
  - Xác nhận bằng status code, xác nhận từ khoá (nếu cần thì đọc body)
- Kiểm tra TCP:
  - Sử dụng `cloudflare:sockets` kết nối + timeout + close
- Máy trạng thái (State machine):
  - Ngưỡng thất bại/thành công liên tục (UP->DOWN, DOWN->UP)
  - Ghi `check_results`, upsert `monitor_state`
  - Bảo lưu `outages` (Khai báo/Đóng chuỗi sự kiện mở/đóng)

Tiêu chí chấp nhận (DoD):

- Ít nhất có 2 monitor (HTTP + TCP) hoạt động trơn tru
- Bảng `monitor_state` tự cập nhật dựa vào lịch trình giám sát; DOWN/UP thay đổi chính xác; khoảng ngắt `outages` đóng lại hợp lí

---

## 5. Phase 4 — Cảnh báo (Webhook) (1–2 Ngày)

Nhiệm vụ:

- Thêm chức năng cho CRUD `notification_channels` (admin)
- Quản lý Webhook dispatch:
  - Hỗ trợ tuỳ chọn method/headers/timeout/payloadType(json)
  - Yếu tố tự phân tách Idempotency: chống trùng bằng `notification_deliveries`
  - Tuỳ chọn kí (HMAC-SHA256)
- Kích hoạt cảnh báo:
  - Chỉ gửi `monitor.down`/`monitor.up` khi trạng thái thay đổi không nằm trong khoảng bảo trì
  - Sử dụng `ctx.waitUntil()` để gửi mà không ngăn cản quá trình thực hiện scheduled()

Tiêu chí chấp nhận (DoD):

- Cảnh báo có thể kích hoạt webhook sau khi thay đổi (DOWN/UP)
- Cùng một lệnh sẽ không kích hoạt một webhook 2 lần.

---

## 6. Phase 5 — Số liệu API Public (1–2 Ngày)

Nhiệm vụ:

- `GET /api/v1/public/status`:
  - Phân tích thông tin cho các monitor từ `monitor_state`
  - Thêm chức năng xem monitor và danh sách kết nối trong lần cập nhật cuối (N giá trị gần nhất)
- `GET /api/v1/public/monitors/:id/latency?range=24h`
- `GET /api/v1/public/monitors/:id/uptime?range=24h|7d|30d`:
  - Đo lường và tổng hợp số liệu về downtime/uptime từ `outages`
  - Xử lý các giá trị UNKNOWN theo những gì đã được miêu tả ở `Application.md`

Tiêu chí chấp nhận (DoD):

- Giao diện có thể tạo trang hiển thị từ API public tại đầu ra

---

## 7. Phase 6 — Cấu trúc Web (Trang Trạng thái + MVP Admin) (2–5 Ngày)

Nhiệm vụ:

- Kế hoạch Web:
  - Bảng định tuyến React Router: Status / Admin
  - Phân luồng dữ liệu của TanStack Query tại API Public/Admin
  - Xây dựng phần giao diện bằng Tailwind
- Trang trạng thái:
  - Header Global banner + danh sách Monitor
  - Thanh kiểm tra tình trạng kết nối nhanh - Heartbeat bar (60 kết quả cuối)
  - Đồ thị tính toán Latency (24h)
- Dashboard Admin:
  - Monitors CRUD
  - Thủ công gửi bài Test (`POST /admin/monitors/:id/test`)
  - Channel Cảnh báo CRUD + Test

Tiêu chí chấp nhận (DoD):

- Một người sử dụng UI có thể: Thêm mới 1 monitor -> Thực thi scheduled ping -> Thấy được kết quả ở public -> Báo DOWN gửi cảnh báo

---

## 8. Phase 7 — Sao lưu / Chống lỗi / Release (1–3 Ngày)

Nhiệm vụ:

- Dữ liệu duy trì (Retention):
  - Xoá những file kết quả sau kiểm tra ở `check_results` hàng ngày (theo lịch điều chỉnh cho phép được chỉ định)
- An toàn bảo mật:
  - Validation cấu hình target từ monitor (xem lại phương thức giao thức/giới hạn IP nội bộ)
  - Các cấu hình bảo mật API Rate Limiting.
- Tính khả thi của log (Observability):
  - Cập nhật quá trình log liên tục trong scheduled (Tổng kết lượng, thời gian, trạng thái, colo xuất phát)
- Bước tiến hành chuẩn bị lên Production:
  - Docs: Cập nhật file README.

Tiêu chí chấp nhận (DoD):

- Sản phẩm có thể được lên CF (Cloudflare): Triển khai thành công Pages + Worker + D1 migrations không gặp cản trở
- Kích thước lưu trữ của ứng dụng có sự đảm bảo về hạn mức duy trì bảo vệ

---

## 9. Phase 8 — Sự cố (Incident System) & Trạng thái hoạt động (v0.2) (2–4 Ngày)

Nhiệm vụ:

- API của Worker (Admin):
  - Bố trí tính năng với các chức năng Incidents: `GET/POST /api/v1/admin/incidents`
  - Các phần tiếp diễn với Incident updates: `POST /api/v1/admin/incidents/:id/updates`
  - Hoàn tất xử lý - resolve: `PATCH /api/v1/admin/incidents/:id/resolve`
  - Xoá lịch sử - delete: `DELETE /api/v1/admin/incidents/:id`
  - Chỉ mục liên kết của Monitors cùng vs Sự cố (Incidents): Đính kèm biến `monitor_ids: number[]` (Dung lượng chịu ảnh hưởng) trong lệnh tạo.
  - Sửa lỗi trong API format được đồng nhất.
- API của Worker (Public):
  - `GET /api/v1/public/incidents?limit=20`
  - `GET /api/v1/public/status` để đưa kết quả thông báo hoạt động từ Incidents/updates vào
  - Xem tất cả API đang trỏ tới Monitor cùng thông số hiển thị chi tiết (受影响组件)
- Chức năng Mở rộng trong Webhook:
  - Cảnh báo mới về Event Trigger: `incident.created / incident.updated / incident.resolved`
  - Không trùng sự kiện thông báo do đã đính với ID và biến từ webhook (Idempotency).
- Tích hợp của hệ Web UI:
  - Admin Dashboard tạo mới, thêm Incidents (Markdown rendering)
  - Liệt kê Timeline thông báo tại Status (gắn cố định đầu bảng sự cố mở)

Tiêu chí chấp nhận (DoD):

- Trang Backend đã có thể sử dụng tạo mới/gắn cập nhật sự cố -> Có thể theo dõi ở trang Status.
- Hệ thống có khả năng xuất phản hồi cho việc sử kiện thay đổi cấu hình trạng thái qua Webhook

---

## 10. Phase 9 — Cửa sổ Bảo trì (Maintenance Windows) & Không xuất thông báo cảnh báo (v0.2) (2–4 Ngày)

Nhiệm vụ:

- Cập nhật về API ở cấp Admin:
  - Triển khai chức năng CRUD trên hệ thống `maintenance_windows`.
  - Giới hạn với xác minh định dạng `starts_at < ends_at`.
  - Định ra sự liên kết bảo trì kèm biến monitor.
- Quy chuẩn Scheduler:
  - Ngưng xuất tín hiệu báo cáo up/down của Webhook ở khung bảo trì cho Monitor nhất định.
  - Giao diện có thông báo khung hoạt động/không chạy.
- Tích hợp của Web UI:
  - Khu vực chỉnh bảo trì ở Admin UI.
  - Active & upcoming event về bảo trì ở Status page UI.

Tiêu chí chấp nhận (DoD):

- Ở thời điểm cho mục giám sát diễn ra, Monitor chỉ liên kết các kết quả của Monitor xuống, không kích hoạt DOWN/UP cảnh báo; Trong đó những Monitor thông thường vẫn chạy cảnh báo Webhook.
- Status page đã có thể thấy được lịch làm việc và bảo trì.

---

## 11. Phase 10 — Báo cáo & Số liệu Analytics (v0.3) (3–7 Ngày)

Nhiệm vụ:

- Khung số liệu Analytics:
  - Tuỳ chỉnh chi tiết Monitor: Đo tốc độ (P50/P95), Uptime/Downtime/Unknown trong các mục (24h/7d/30d/90d)
  - Số liệu toàn cầu: Các báo cáo phân tích toàn hệ thống.
  - Tối ưu cấu trúc phân mảng dài hạn khi chuyển lên cấp Rollup bảng.
- Worker API bổ sung:
  - Hệ public cho thời hạn xem 30d/90d
  - Thêm cấu trúc Backend cho endpoints Analytics.
- Bổ sung ở Web UI:
  - Analytics với các báo cáo trên Dashboard (Đồ thị qua Recharts)
  - Khả năng kiểm thử Range chọn lọc (selector, tooltip, empty values).
- File hỗ trợ (Option):
  - Có thể trích xuất cấu hình (Export CSV file) cho kết quả.

Tiêu chí chấp nhận (DoD):

- Thời gian để tạo các báo cáo ở mức dưới thời gian Time-out để tránh trích xuất 100% dữ liệu 1 lúc gây vỡ API
- Dashboard hiển thị Uptime% / P95 Latency / Outage...

---

## 12. Phase 11 — Giao diện Tinh tế UX/UI (Dashboard + Status Page) (2–6 Ngày)

Nhiệm vụ:

- Ở môi trường Admin:
  - Trải nghiệm khi cài Monitor dễ dàng: Thiết kế Template HTTP/TCP với khả năng thử tự động.
  - Trải nghiệm cho việc phân chia nhóm quản lý của cấu hình Monitor.
  - Cải tiến hiệu ứng: Thêm tính năng Toast.
- Ở Status page:
  - Sửa những thiết kế Banner của Status page qua những yêu cầu đã mô tả ở `Application.md`.
  - Chú thích hướng dẫn (Legends) tại Status.
  - Có các tối ưu hoá truy cập (Mobile-responsive, Colors).
- Thiết kế ở hệ Project Code:
  - Khung đồng bộ UI với cách API xử lý (Tối ưu giao diện về errors).

Tiêu chí chấp nhận (DoD):

- Admin khi vừa nhận ứng dụng phải dễ dàng tìm cấu hình, thêm chức năng/chạy test/...
- Giao diện Loading/Empty hoạt động ở 1 số page chuẩn.

---

## 13. Phase 12 — Thiết lập (Settings) / Tùy biến (Branding & Parameters) (v0.3+) (2–5 Ngày)

Nhiệm vụ:

- Chỉnh sửa Config hệ Settings:
  - Khởi tạo Database cho Bảng Settings (không mã khoá - non-secret config). Cấu hình Website, ngôn ngữ, Default Range.
  - API (Backend): Update Patch trên hệ `admin/settings` API.
- Trang Public cấu hình Brand Customization:
  - Thêm Logo và tuỳ chọn chỉnh theme (Màu Tailwind CSS).
  - Tích hợp hiển thị Statuspage Notice (Công bố của người sở hữu)
- Update lại văn bản Docs.

Tiêu chí chấp nhận (DoD):

- Người được chọn làm Admin có quyền cài tiêu đề web, ngôn ngữ cho hệ Dashboard qua giao diện trên Statuspage.

---

## 14. Phase 13 — Cụm Kiểm Toán (Audit) / Cụm Ops Admin (v0.3+) (2–5 Ngày)

Nhiệm vụ:

- Các thao tác log (Sử dụng với `Application.md` 12.3):
  - v0: Bổ sung cho file log cấu hình và các bước điều hành hoạt động nội bộ hệ thống.
  - v1: Hệ cơ sở `audit_logs` (thông qua Migration SQL).
- Phụ trợ thêm (Data Tooling):
  - Thêm phương pháp đẩy Export JSON cấu trúc ra với hệ Monitor / Cảnh báo / Thiết lập.
  - Chức năng tự xuất kết quả phục vụ chia sẻ kiểm toán.

Tiêu chí chấp nhận (DoD):

- Ứng dụng phải hiểu được "Ai/Lúc Nào sửa cấu hình nào của Monitor" qua tệp Log.
- Cho phép người xem có thể copy/share kết quả sự kiện của hệ thống.

---

## 15. Phase 14 — Tính năng nâng cao Monitoring / Thông Báo (v1) (3–10 Ngày)

Nhiệm vụ:

- Hệ Tracking Update (Không có dependency thêm của bên Server Node):
  - Thêm mục phân bố Header, phân trang kiểm duyệt độ ổn định.
  - Mức Threshold cho Cấu hình Flapping.
- Thông báo (Cảnh báo chi tiết Webhook Notification Update):
  - Cho quyền lọc cảnh báo tuỳ cấp.
  - Bổ sung tuỳ chọn App Webhook (Discord / Slack).
- Thông báo ở trang Public:
  - Có cách gán mục tag (Nhóm Component).

Tiêu chí chấp nhận (DoD):

- Có thể tạo chức năng chỉ cảnh báo qua N phút liên tục.
- Trang trạng thái tuân thủ những nguyên lý cho việc phân loại và xếp nhóm (Grouping Component) vào một cụm.

---

## 16. Phase 15 — Cụm Giám Sát Chéo Đa Vùng Địa Lý (Nâng cấp Tùy chọn) (v1+) (5–14 Ngày)

Hướng dẫn: Worker Scheduled Engine có thể kích hoạt ở vị trí địa lý bị cố định của CF Network và khó thay đổi do hệ Engine Worker Edge này giới hạn; Nếu bạn cần test PING quốc tế thì tính năng này phục vụ cho việc sử dụng ở `Application.md` - Mục 6.7. Tính năng phụ, cần có mô tả thiết kế rõ nếu chạy.

Nhiệm vụ (Chọn 1 trong 2):

- A. Cách Dùng Durable Object: Dùng mã Object cho LocationHint và cho check. Bổ sung `check_results.location`.
- B. Cách Dùng External Probe Node: Khai báo với 1 endpoint, để những server / probe bên ngoài đánh log của check vào DB.

Tiêu chí chấp nhận (DoD):

- Thấy được chỉ số Uptime và thông báo lỗi có sự xác thực của 2 hay nhiều cụm Node (Ví dụ: Server Mỹ thấy bình thường nhưng Server Nhật bị Lỗi DOWN).

---

## 17. Phase 16 — Hoàn thành Cụm "Phát hành" Toàn Bộ Dịch vụ (v1+) (2–6 Ngày)

Nhiệm vụ:

- Tối ưu & Tinh gọn chi phí:
  - Trình duyệt thêm tính năng dùng API Caches: cho phần Public Status
  - Scheduled Code Optimize / Cụm Database Tinh Gọn (Batch Update / Xử lý Index / Degraded Function).
- Đóng gói Dịch vụ Hỗ trợ phát hành:
  - Biên tập tài liệu triển khai A-Z 0-100 Deployment Guide cho người ít sử dụng Server.
  - Tích hợp thêm Data Example Sample cho những User muốn Test Giao diện khi Local Development.
- Ổn định và Check Hệ Thống Bug (Regression Checks):
  - Kiểm định code cho (Incident & Maintenance Window).
  - Khởi tạo thư mục Checklist những lỗi có thể gây cản hệ thống.

Tiêu chí chấp nhận (DoD):

- New user cần < 30 phút cho việc thiết lập 1 Account CF / Upload Web CF để chạy được Dịch vụ ở bản live cho người khác.
- Kiểm duyệt chạy Checklist đảm bảo cấu hình cốt lõi hoạt động bình thường trên các nền Edge Node.
