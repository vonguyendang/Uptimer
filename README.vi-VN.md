<div align="center">

# Uptimer

**Giám sát thời gian hoạt động (uptime) không máy chủ & trang trạng thái (status page) trên mạng biên (edge network) của Cloudflare**

[![CI](https://github.com/VrianCao/Uptimer/actions/workflows/ci.yml/badge.svg)](https://github.com/VrianCao/Uptimer/actions/workflows/ci.yml)
[![Deploy](https://github.com/VrianCao/Uptimer/actions/workflows/deploy.yml/badge.svg)](https://github.com/VrianCao/Uptimer/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Giám sát dịch vụ của bạn, hiển thị trạng thái thời gian thực cho khách truy cập và nhận thông báo khi có sự cố — tất cả đều chạy trên Cloudflare Workers + Pages + D1 mà không cần vận hành máy chủ (zero ops).

[Triển khai Nhanh](#triển-khai-nhanh-5-bước) · [Phát triển Cục bộ](#phát-triển-cục-bộ) · [Tài liệu](#tài-liệu) · [Đóng góp](CONTRIBUTING.vi-VN.md)

English | [中文](README.zh-CN.md) | **[Tiếng Việt](README.vi-VN.md)**

</div>

---

## Tại sao chọn Uptimer?

- **Zero ops** — Không cần quản lý máy chủ, container hay cơ sở dữ liệu. Chạy hoàn toàn trên các gói miễn phí/trả phí của Cloudflare.
- **Edge-native** — Các đầu dò giám sát chạy từ Cloudflare Workers; trang trạng thái của bạn được phục vụ từ biên mạng CDN.
- **Triển khai 1-click** — Đẩy lên `main` và GitHub Actions sẽ xử lý mọi thứ: D1 migrations, triển khai Worker, build Pages.
- **Đầy đủ tính năng** — Kiểm tra HTTP/TCP, quản lý sự cố, lên lịch bảo trì, thông báo webhook, bảng điều khiển quản trị (admin dashboard).

## Các Tính năng

**Giám sát**

- Đầu dò HTTP(S) với các tùy chỉnh header, body, mã trạng thái & xác nhận từ khóa
- Kiểm tra kết nối cổng TCP
- Có thể cấu hình thời gian chờ (timeouts), ngưỡng thử lại (retry thresholds) và kiểm soát trạng thái chập chờn (flapping)
- Máy trạng thái tự động: UP (Hoạt động) / DOWN (Ngừng hoạt động) / MAINTENANCE (Bảo trì) / PAUSED (Tạm dừng) / UNKNOWN (Không rõ)

**Trang Trạng thái**

- Trang trạng thái công khai với trạng thái tổng hợp theo thời gian thực
- Biểu đồ phần trăm thời gian hoạt động (uptime) và độ trễ (latency) cho từng monitor
- Các sự cố và khoảng thời gian bảo trì đang hoạt động
- Hỗ trợ đa ngôn ngữ (en, zh-CN, zh-TW, ja, es, vi-VN)

**Quản lý Sự cố**

- Tạo, cập nhật và giải quyết sự cố theo dòng thời gian (timeline)
- Lên lịch các khoảng thời gian bảo trì
- Tất cả đều hiển thị trên trang trạng thái công khai

**Thông báo**

- Gửi thông báo Webhook tới Discord, Slack, ntfy, hoặc bất kỳ endpoint HTTP nào
- Tùy chỉnh template tin nhắn & payload với các biến nội suy (magic variables)
- Tùy chọn xác minh chữ ký HMAC-SHA256
- Gửi thông báo an toàn (Idempotent) với tính năng loại bỏ trùng lặp (deduplication)

**Bảng điều khiển Quản trị**

- CRUD Monitor với tổng quan trạng thái trực tiếp
- Quản lý kênh thông báo kèm nút gửi thử
- Phân tích bằng biểu đồ uptime/latency và xuất file CSV
- Cài đặt hệ thống (tiêu đề trang, múi giờ, các ngưỡng, thời gian lưu giữ)

## Kiến trúc

```
                ┌──────────────────────────────────────────┐
                │            Mạng Cloudflare               │
                │                                          │
Người dùng ────►│  Pages (React SPA)                       │
                │      │                                   │
                │      ▼                                   │
Admin ─────────►│  Workers (Hono API)                      │
                │      │              │                    │
                │      ▼              ▼                    │
                │    D1 DB      Cron Triggers              │
                │             (lên lịch kiểm tra)          │
                │                     │                    │
                └─────────────────────┼────────────────────┘
                                      │
                                      ▼
                            Dịch vụ Đích (HTTP/TCP)
                                      │
                                      ▼
                               Webhooks ──► Discord / Slack / ntfy
```

## Ngăn xếp Công nghệ (Tech Stack)

| Lớp (Layer)     | Công nghệ                                                          |
| --------------- | ------------------------------------------------------------------ |
| Frontend        | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Recharts |
| Backend         | Cloudflare Workers, Hono, Zod                                      |
| Database        | Cloudflare D1 (SQLite), Drizzle ORM                                |
| Hosting         | Cloudflare Pages (frontend), Workers (API)                         |
| CI/CD           | GitHub Actions                                                     |
| Package Manager | pnpm (monorepo)                                                    |

## Triển khai Nhanh (5 Bước)

Triển khai bản Uptimer của riêng bạn mà không cần đụng đến code hay file cấu hình:

### Bước 1 — Fork

Nhấn nút **Fork** ở góc trên cùng bên phải của kho lưu trữ (repository) này để tạo một bản sao cho riêng bạn.

### Bước 2 — Tạo một Cloudflare API Token

1. Tới [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Nhấn **Create Token** → sử dụng template **Edit Cloudflare Workers**
3. Thêm các quyền hạn sau:
   - `Account / Cloudflare Pages / Edit`
   - `Account / D1 / Edit`
   - `Account / Account Settings / Read`
4. Sao chép token vừa được tạo

### Bước 3 — Thêm GitHub Secrets

Vào repo đã fork của bạn → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, và thêm:

| Tên Secret              | Giá trị                                                                                                         | Bắt buộc |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | :---------: |
| `CLOUDFLARE_API_TOKEN`  | Token từ Bước 2                                                                                             |     Có      |
| `UPTIMER_ADMIN_TOKEN`   | Bất kỳ chuỗi mạnh nào (đây sẽ là mật khẩu cho admin dashboard)                                                |     Có      |
| `CLOUDFLARE_ACCOUNT_ID` | [Cloudflare Account ID](https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/) của bạn | Khuyên dùng |

### Bước 4 — Chạy GitHub Actions

Vào **Actions** → **Deploy to Cloudflare** → **Run workflow** (hoặc chỉ cần push một commit lên `main`/`master`).

Workflow sẽ tự động:

- Tạo database D1 và chạy các migrations
- Triển khai Worker (API + giám sát theo lịch)
- Build và triển khai Pages frontend (trang trạng thái)
- Đẩy admin token vào Worker secret

### Bước 5 — Truy cập Trang Trạng thái của bạn

Sau khi workflow chạy thành công (thường mất ~2 phút cho lần deploy đầu tiên):

- **Trang trạng thái** → `https://<tên-repo-của-bạn>.pages.dev`
- **Bảng điều khiển Quản trị** → `https://<tên-repo-của-bạn>.pages.dev/admin`
- **API** → `https://<tên-repo-của-bạn>.workers.dev/api/v1/public/status`

Đăng nhập vào admin dashboard bằng `UPTIMER_ADMIN_TOKEN` bạn đã thiết lập và bắt đầu thêm các monitor.

> **Cập nhật liên tục** — Vì bạn deploy từ repo fork của riêng mình, bạn có thể [đồng bộ với repo gốc (upstream)](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork) bất cứ lúc nào. Deploy workflow sẽ tự động chạy lại sau mỗi lần đồng bộ.

> Để xem các tùy chọn nâng cao (tên miền tùy chỉnh, đặt tên tài nguyên, thay đổi đường dẫn admin), hãy tham khảo [Hướng dẫn Triển khai](docs/deploy-github-actions.vi-VN.md).

---

## Phát triển Cục bộ

<details>
<summary>Nhấn để mở rộng hướng dẫn thiết lập môi trường phát triển cục bộ</summary>

### Yêu cầu trước

- Node.js >= 22.14.0
- pnpm >= 10.8.1

### Thiết lập

```bash
# 1. Clone và cài đặt
git clone https://github.com/<your-username>/Uptimer.git
cd Uptimer
pnpm install

# 2. Thiết lập local secrets
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
# Chỉnh sửa .dev.vars và gán ADMIN_TOKEN=mật-khẩu-bí-mật-của-bạn

# 3. Chạy các server phát triển (tự động khởi tạo D1)
pnpm dev
```

Các địa chỉ mặc định:

- **Trang trạng thái**: http://localhost:5173
- **Admin dashboard**: http://localhost:5173/admin
- **API**: http://localhost:8787/api/v1

> Để xem toàn bộ hướng dẫn phát triển cục bộ (seed data, kiểm thử API, khắc phục sự cố), tham khảo [Develop/LOCAL-TESTING.vi-VN.md](Develop/LOCAL-TESTING.vi-VN.md).

</details>

## Tài liệu

| Tài liệu                                                                                                   | Mô tả                                                      |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Hướng dẫn Triển khai](docs/deploy-github-actions.vi-VN.md) ([English](docs/deploy-github-actions.md))     | Hướng dẫn chi tiết triển khai qua GitHub Actions           |
| [Tham chiếu Cấu hình](docs/configuration-reference.vi-VN.md) ([English](docs/configuration-reference.md)) | Toàn bộ các tham số có thể cấu hình (secrets, biến, cài đặt)|
| [Hệ thống Thông báo](docs/notifications.vi-VN.md) ([English](docs/notifications.md))                       | Thiết lập Webhook, template, chữ ký, xử lý sự cố            |
| [Phát triển Cục bộ](Develop/LOCAL-TESTING.vi-VN.md)                                                        | Thiết lập cục bộ, seed data, quy trình kiểm thử            |

## Kiểm tra Chất lượng (Quality Checks)

```bash
pnpm lint          # Chạy ESLint trên toàn bộ packages
pnpm typecheck     # Kiểm tra nghiêm ngặt kiểu (strict) TypeScript
pnpm test          # Kiểm tra unit (Unit tests)
pnpm format:check  # Kiểm tra định dạng bằng Prettier
```

## Đóng góp

Mọi đóng góp luôn được hoan nghênh! Vui lòng xem [CONTRIBUTING.vi-VN.md](CONTRIBUTING.vi-VN.md) để biết thêm về các hướng dẫn.

## Giấy phép (License)

Dự án này được cấp phép theo Giấy phép MIT — xem file [LICENSE](LICENSE) để biết thêm chi tiết.

---

<div align="center">

Được xây dựng với [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/) + [React](https://react.dev/)

Cảm ơn [UptimeFlare](https://github.com/lyc8503/UptimeFlare) vì những ý tưởng truyền cảm hứng về mô hình giám sát thời gian hoạt động (uptime) cho Cloudflare.

</div>
