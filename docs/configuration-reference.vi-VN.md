# Tham chiếu Cấu hình (Configuration Reference)

English | [中文](configuration-reference.zh-CN.md) | [Tiếng Việt](configuration-reference.vi-VN.md)

Tất cả các tham số có thể cấu hình cho Uptimer, được tổ chức theo ngữ cảnh: triển khai, thời gian chạy (runtime), và phát triển cục bộ.

## 1. GitHub Actions (Triển khai)

Nguồn: `.github/workflows/deploy.yml`

### Secrets (Bí mật)

| Tên                     | Bắt buộc         | Mô tả                                                                            |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Có              | Xác thực API Cloudflare (triển khai Worker/Pages, quản lý D1)                    |
| `CLOUDFLARE_ACCOUNT_ID` | Không (khuyên dùng) | ID Tài khoản Cloudflare; tự động phân giải nếu không cung cấp                    |
| `UPTIMER_ADMIN_TOKEN`   | Có              | Khóa truy cập bảng điều khiển quản trị; tự động ghi vào Worker Secret `ADMIN_TOKEN`|
| `VITE_ADMIN_PATH`       | Không           | Ghi đè đường dẫn admin (ưu tiên hơn variable)                                     |

### Variables (Biến số)

| Tên                     | Mặc định                  | Mô tả                                              |
| ----------------------- | ------------------------- | -------------------------------------------------- |
| `UPTIMER_PREFIX`        | Tên kho lưu trữ (slug)    | Tiền tố chung cho tên tài nguyên                   |
| `UPTIMER_WORKER_NAME`   | `${UPTIMER_PREFIX}`       | Tên Worker                                         |
| `UPTIMER_PAGES_PROJECT` | `${UPTIMER_PREFIX}`       | Tên dự án Pages                                    |
| `UPTIMER_D1_NAME`       | `${UPTIMER_PREFIX}`       | Tên cơ sở dữ liệu D1                               |
| `UPTIMER_D1_BINDING`    | `DB`                      | Tên binding D1 trong Worker                        |
| `UPTIMER_API_BASE`      | Tự lấy hoặc `/api/v1`     | Địa chỉ API (vd. `https://my-worker.example.com/api/v1` hoặc `/api/v1`) |
| `UPTIMER_API_ORIGIN`    | Tự lấy                    | Nguồn API (vd. `https://my-worker.example.com`); `/api/v1` được nối tự động |
| `VITE_ADMIN_PATH`       | —                         | Đường dẫn admin (bị ghi đè bởi Secret nếu được thiết lập) |
| `UPTIMER_ADMIN_PATH`    | —                         | Biến dự phòng cho `VITE_ADMIN_PATH`                |

> **Địa chỉ API**: Thường không cần cấu hình — workflow sẽ tự động phát hiện URL Worker. Chỉ đặt `UPTIMER_API_BASE` hoặc `UPTIMER_API_ORIGIN` nếu API nằm trên tên miền tùy chỉnh. Cả hai đều chấp nhận thông tin giống nhau dưới các định dạng khác nhau; chỉ cần đặt một trong hai là đủ.

## 2. Worker Runtime (Thời gian chạy của Worker)

### Secrets (Bí mật)

| Tên           | Bắt buộc | Mô tả                 |
| ------------- | -------- | ---------------------- |
| `ADMIN_TOKEN` | Có      | Admin API Bearer Token |

### Biến Môi trường (Environment Variables)

Nguồn: `apps/worker/wrangler.toml` và `apps/worker/src/env.ts`

| Tên                           | Mặc định | Mô tả                                          |
| ----------------------------- | -------- | ---------------------------------------------- |
| `ADMIN_RATE_LIMIT_MAX`        | `60`     | Số request tối đa trong một chu kỳ rate-limit (admin API) |
| `ADMIN_RATE_LIMIT_WINDOW_SEC` | `60`     | Thời gian chu kỳ rate-limit tính bằng giây     |

## 3. Web Build

Nguồn: `apps/web/.env.example`

| Tên               | Mặc định  | Mô tả                              |
| ----------------- | --------- | ---------------------------------- |
| `VITE_ADMIN_PATH` | `/admin`  | Tiền tố route cho trang quản trị   |
| `VITE_API_BASE`   | `/api/v1` | URL gốc API cho các request frontend|

> `VITE_API_BASE` được đưa vào bởi workflow triển khai từ `UPTIMER_API_BASE`, `UPTIMER_API_ORIGIN` hoặc URL Worker. Sử dụng `/api/v1` làm mặc định nếu không có cái nào khả dụng.

## 4. Cài đặt Runtime (D1)

Nguồn: `apps/worker/src/schemas/settings.ts`

Có thể cấu hình thông qua Admin API: `PATCH /api/v1/admin/settings`

| Khóa                              | Mô tả                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| `site_title`                      | Tiêu đề trang trạng thái                                        |
| `site_description`                | Mô tả trang trạng thái                                          |
| `site_locale`                     | Ngôn ngữ trang web (`auto` / `en` / `zh-CN` / `zh-TW` / `ja` / `es` / `vi-VN`) |
| `site_timezone`                   | Mã định danh múi giờ IANA                                       |
| `retention_check_results_days`    | Số ngày lưu trữ dữ liệu `check_results`                         |
| `state_failures_to_down_from_up`  | Số lần lỗi liên tiếp yêu cầu để chuyển trạng thái UP -> DOWN    |
| `state_successes_to_up_from_down` | Số lần thành công liên tiếp yêu cầu để chuyển trạng thái DOWN -> UP |
| `admin_default_overview_range`    | Khoảng thời gian mặc định cho admin overview                    |
| `admin_default_monitor_range`     | Khoảng thời gian mặc định cho chi tiết monitor admin            |
| `uptime_rating_level`             | Các ngưỡng xếp hạng uptime                                      |

## 5. Phát triển Cục bộ

### Worker

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Cấu hình tối thiểu:

```dotenv
ADMIN_TOKEN=changeme
```

### Web

```bash
cp apps/web/.env.example apps/web/.env
```

Các ghi đè tùy chọn:

```dotenv
VITE_ADMIN_PATH=/admin
```

## 6. Ghi chú Bảo mật

- `ADMIN_TOKEN` chỉ được phép lưu trữ trong Worker Secrets hoặc `.dev.vars` cục bộ. Không bao giờ commit lên Git.
- Trong GitHub Actions, luôn sử dụng Secrets cho các giá trị nhạy cảm — không bao giờ dùng Variables.
- Các secret ký webhook (signing secrets) phải tham chiếu tới Worker Secrets (không bao giờ lưu trữ trong database).
