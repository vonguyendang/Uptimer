# Hướng dẫn Triển khai (GitHub Actions)

English | [中文](deploy-github-actions.zh-CN.md) | [Tiếng Việt](deploy-github-actions.vi-VN.md)

Triển khai Uptimer lên Cloudflare sử dụng workflow có sẵn của GitHub Actions.

## Yêu cầu

- Một kho lưu trữ GitHub (nhánh mặc định: `master` hoặc `main`)
- Một tài khoản Cloudflare
- Một Cloudflare API Token với quyền triển khai
- Quyền truy cập vào Settings > Secrets and Variables của kho lưu trữ

## Tổng quan Workflow

**Kích hoạt (Trigger)**: Push lên nhánh `main`/`master`, hoặc kích hoạt thủ công bằng `workflow_dispatch`

**File**: `.github/workflows/deploy.yml`

**Các bước (theo thứ tự)**:

1. Cài đặt Node + pnpm + dependencies
2. Phân giải Cloudflare Account ID (đọc từ cấu hình, tự động fallback thành truy vấn API nếu thiếu)
3. Tính toán tên các tài nguyên (Worker / Pages / D1)
4. Kiểm tra hoặc tạo cơ sở dữ liệu D1, chèn `database_id` thực tế vào file tạm `wrangler.ci.toml`
5. Chạy các D1 migrations trên máy chủ từ xa
6. Triển khai Worker
7. (Tùy chọn) Ghi Worker Secret: `ADMIN_TOKEN`
8. Build và triển khai Pages
9. (Tùy chọn) Ghi Pages Secret: `UPTIMER_API_ORIGIN`

## Cấu hình

### Secrets Bắt buộc

| Tên                    | Bắt buộc | Mô tả                                                                    |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN` | Có      | Xác thực Cloudflare API                                                  |
| `UPTIMER_ADMIN_TOKEN`  | Có      | Khóa truy cập bảng điều khiển; tự động chèn vào Worker secret `ADMIN_TOKEN`|

### Secrets Khuyên dùng

| Tên                     | Mô tả                           |
| ----------------------- | ------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Tránh lỗi tự động phân giải ID  |

### Các biến Tùy chọn (Variables)

Ghi đè định tuyến và tên mặc định:

| Tên                                      | Mặc định                  | Mô tả                        |
| ---------------------------------------- | ------------------------- | ---------------------------- |
| `UPTIMER_PREFIX`                         | Tên kho lưu trữ (slug)    | Tiền tố chung cho tài nguyên |
| `UPTIMER_WORKER_NAME`                    | `${UPTIMER_PREFIX}`       | Tên Worker                   |
| `UPTIMER_PAGES_PROJECT`                  | `${UPTIMER_PREFIX}`       | Tên dự án Pages              |
| `UPTIMER_D1_NAME`                        | `${UPTIMER_PREFIX}`       | Tên cơ sở dữ liệu D1         |
| `UPTIMER_D1_BINDING`                     | `DB`                      | Tên binding D1 trong Worker  |
| `UPTIMER_API_BASE`                       | Tự lấy hoặc `/api/v1`     | Địa chỉ API (vd. `https://my-worker.example.com/api/v1` hoặc `/api/v1`) |
| `UPTIMER_API_ORIGIN`                     | Tự lấy                    | Nguồn API (vd. `https://my-worker.example.com`); `/api/v1` được nối tự động |
| `VITE_ADMIN_PATH` / `UPTIMER_ADMIN_PATH` | —                         | Đường dẫn admin tùy chỉnh    |

> Nếu không thiết lập các biến đặt tên, workflow sẽ sử dụng slug của tên kho lưu trữ làm tiền tố mặc định. Điều này giúp giữ tên ổn định trên các bản fork.
>
> **Địa chỉ API**: Thường không cần cấu hình — workflow tự động phát hiện URL Worker. Chỉ đặt `UPTIMER_API_BASE` hoặc `UPTIMER_API_ORIGIN` nếu API nằm trên tên miền tùy chỉnh. Cả hai đều chấp nhận thông tin giống nhau; chỉ cần đặt một trong hai.

## Quyền cho Cloudflare Token

Workflow tạo và cập nhật nhiều tài nguyên. Token của bạn cần:

- Workers Scripts: deploy và quản lý secrets
- D1: truy vấn, tạo, và migrate cơ sở dữ liệu
- Pages: tạo dự án và deploy
- Account: đọc thông tin tài khoản (để phân giải account ID)

## Lần Triển khai Đầu tiên

1. Thêm `CLOUDFLARE_API_TOKEN` vào repository secrets
2. Thêm `UPTIMER_ADMIN_TOKEN` (khóa truy cập admin)
3. Thêm `CLOUDFLARE_ACCOUNT_ID` (khuyên dùng)
4. (Tùy chọn) Đặt `UPTIMER_PREFIX` để tránh trùng tên
5. Push lên `master`/`main`, hoặc kích hoạt thủ công "Deploy to Cloudflare"
6. Sau khi workflow chạy thành công, lưu ý URL của Worker và URL của Pages từ log

## Kiểm tra sau Triển khai

### Kiểm tra Trang Trạng thái

- Truy cập Pages URL (trang trạng thái công khai)
- Điều hướng tới `/admin` (hoặc `VITE_ADMIN_PATH` tùy chỉnh của bạn)

### Kiểm tra API

```bash
# API Công khai
curl https://<worker-url>/api/v1/public/status

# Admin API
curl https://<worker-url>/api/v1/admin/monitors \
  -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>"
```

### Xác minh Cơ sở dữ liệu (Tùy chọn)

Sử dụng Wrangler để kiểm tra các bảng khóa đã tồn tại trong D1:

```
monitors, monitor_state, check_results, outages, settings
```

## Xử lý Sự cố (Troubleshooting)

### Lỗi "Resolve Cloudflare Account ID"

- Xác minh `CLOUDFLARE_API_TOKEN` đã được thiết lập và hợp lệ
- Đảm bảo token có quyền đọc tài khoản
- Đặt rõ ràng `CLOUDFLARE_ACCOUNT_ID` để bỏ qua bước phân giải tự động

### Lỗi D1 migration

- Kiểm tra xem `UPTIMER_D1_BINDING` có khớp với binding trong `apps/worker/wrangler.toml` hay không
- Xác minh SQL migration là an toàn (idempotent) và đúng cú pháp

### Pages build nhưng API trả về 404 hoặc HTML

- Xác minh `UPTIMER_API_BASE` hoặc `UPTIMER_API_ORIGIN` trỏ đến Worker của bạn, không phải trỏ đến site Pages
- Lỗi "API returned HTML instead of JSON" thường có nghĩa là URL đang truy cập vào Pages (trả về HTML) thay vì Worker
- Nếu không có biến nào được đặt, workflow sử dụng URL Worker tự động — kiểm tra xem nó có phân giải đúng trong log deploy hay không

### Admin trả về lỗi 401

- Xác nhận `UPTIMER_ADMIN_TOKEN` đã được ghi vào Worker Secret
- Kiểm tra xem token trong localStorage của trình duyệt có khớp với secret hay không

## Khôi phục Phiên bản Cũ (Rollback)

Ưu tiên triển khai lại commit gần nhất hoạt động tốt:

1. Tìm commit deploy thành công (màu xanh) gần nhất
2. Kích hoạt lại "Deploy to Cloudflare" từ commit đó
3. Nếu có thay đổi schema, hãy thêm một migration tương thích ngược mới thay vì rollback

> Tuyệt đối không được rollback D1 migrations một cách phá hủy. Nếu migration đã được áp dụng trên remote, hãy sửa chữa bằng một migration mới tiến lên phía trước.

## Mối quan hệ với CI

| Workflow     | Mục đích                               |
| ------------ | -------------------------------------- |
| `ci.yml`     | Cổng chất lượng: lint, typecheck, test |
| `deploy.yml` | Triển khai Production                  |

Chiến lược nhánh khuyên dùng:

- PRs phải vượt qua CI trước khi merge
- `master`/`main` chỉ nhận các thay đổi đã được review
- Releases được kích hoạt tự động khi push — không có sự sai lệch thủ công
