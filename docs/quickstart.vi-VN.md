# Hướng dẫn Triển khai & Sử dụng Uptimer (Quickstart)

Tài liệu này hướng dẫn chi tiết cách triển khai dự án **Uptimer** (lên Cloudflare hoặc chạy cục bộ) và cách cấu hình nhập domain để kiểm tra trạng thái hoạt động (uptime).

---

## 1. Các phương thức triển khai (Deployment)

Uptimer chạy hoàn toàn trên nền tảng Serverless của Cloudflare (Workers + Pages + D1 Database). Bạn có thể chọn một trong hai phương thức triển khai sau:

### Phương thức A: Triển khai lên Cloudflare (Production via GitHub Actions) - Khuyên dùng

Phương thức này giúp bạn triển khai hệ thống của riêng mình mà không cần cấu hình mã nguồn hay thao tác thủ công phức tạp qua các bước sau:

#### Bước 1: Fork Repository
Nhấn nút **Fork** ở góc trên cùng bên phải kho lưu trữ này về tài khoản GitHub cá nhân của bạn.

#### Bước 2: Tạo Cloudflare API Token
1. Truy cập [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Chọn **Create Token** → sử dụng mẫu template **Edit Cloudflare Workers**.
3. Thêm các quyền hạn (Permissions) sau:
   - `Account / Cloudflare Pages / Edit`
   - `Account / D1 / Edit`
   - `Account / Account Settings / Read`
4. Xác nhận tạo và sao chép mã Token được cung cấp.

#### Bước 3: Thêm GitHub Secrets vào Repo đã fork
Vào repository đã fork của bạn trên GitHub → chọn tab **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, sau đó thêm:

| Tên Secret | Mô tả / Giá trị | Bắt buộc |
| :--- | :--- | :---: |
| `CLOUDFLARE_API_TOKEN` | Mã API Token vừa tạo ở Bước 2 | Có |
| `UPTIMER_ADMIN_TOKEN` | Bất kỳ mật khẩu mạnh nào để đăng nhập vào trang quản trị Admin | Có |
| `CLOUDFLARE_ACCOUNT_ID` | [Account ID Cloudflare](https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/) của bạn | Khuyên dùng |

#### Bước 4: Khởi chạy GitHub Actions Workflow
Vào tab **Actions** → chọn workflow **Deploy to Cloudflare** → bấm **Run workflow** (hoặc chỉ cần push một commit bất kỳ lên nhánh chính `main`/`master`). 

Hệ thống sẽ tự động:
- Khởi tạo Database D1 và chạy các migrations.
- Triển khai Worker (API + giám sát theo lịch).
- Build và triển khai Pages Frontend (Trang trạng thái).
- Thiết lập admin token vào Worker secret.

#### Bước 5: Truy cập Trang trạng thái của bạn
Sau khi workflow chạy thành công (~2 phút):
- **Trang trạng thái (Status Page)**: `https://<tên-repo-của-bạn>.pages.dev`
- **Bảng điều khiển Admin**: `https://<tên-repo-của-bạn>.pages.dev/admin` (Sử dụng `UPTIMER_ADMIN_TOKEN` để đăng nhập).
- **API công khai**: `https://<tên-repo-của-bạn>.workers.dev/api/v1/public/status`

---

### Phương thức B: Chạy cục bộ (Local Development)

Yêu cầu máy tính của bạn đã cài đặt:
- **Node.js** >= 22.14.0
- **pnpm** >= 10.8.1

#### Các bước thực hiện:
1. Mở terminal tại thư mục gốc của dự án và cài đặt dependencies:
   ```bash
   pnpm install
   ```
2. Cấu hình biến môi trường cho Worker cục bộ:
   ```bash
   cp apps/worker/.dev.vars.example apps/worker/.dev.vars
   ```
   Mở file `apps/worker/.dev.vars` và cấu hình token quản trị viên:
   ```env
   ADMIN_TOKEN=your-secure-token-here
   ```
3. Khởi chạy toàn bộ hệ thống bằng một lệnh duy nhất:
   ```bash
   pnpm dev
   ```
   Lệnh này tự động chạy migrations cho cơ sở dữ liệu SQLite cục bộ, nạp dữ liệu mẫu chạy thử (seed data) và chạy song song cả 2 máy chủ:
   - **Giao diện Web (React)**: [http://localhost:5173](http://localhost:5173)
   - **Giao diện Admin**: [http://localhost:5173/admin](http://localhost:5173/admin) (Đăng nhập bằng `ADMIN_TOKEN` đã khai báo).
   - **Worker API**: [http://localhost:8787](http://localhost:8787)

---

## 2. Cách nhập Domain vào để kiểm tra (Check Uptime)

Sau khi hệ thống đã hoạt động (ở Local hoặc Production), bạn thực hiện các bước sau để thêm domain vào hệ thống theo dõi:

### Bước 1: Truy cập Admin Dashboard
- Truy cập vào đường dẫn quản trị (Ví dụ: `https://<tên-repo-của-bạn>.pages.dev/admin` hoặc `http://localhost:5173/admin`).
- Nhập **Admin Token** đã cấu hình của bạn để đăng nhập.

### Bước 2: Thêm Monitor mới
- Tại bảng điều khiển Admin, nhấn nút **Add Monitor** (hoặc biểu tượng dấu cộng/nút tạo mới).
- Điền các thông tin cấu hình cho Domain cần check:
  - **Name**: Nhập tên gợi nhớ cho dịch vụ (Ví dụ: `Google Homepage`, `My Backend API`).
  - **Type**: Chọn phương thức kiểm tra:
    - `http`: Phù hợp cho website, REST API endpoint.
    - `tcp`: Phù hợp để kiểm tra kết nối cổng mạng (Ví dụ: SSH `22`, MySQL `3306`, v.v.).
  - **Target**:
    - Đối với `http`: Nhập URL đầy đủ (Ví dụ: `https://google.com` hoặc `https://api.example.com/health`).
    - Đối với `tcp`: Nhập theo định dạng `host:port` (Ví dụ: `example.com:22` hoặc `192.168.1.1:80`).
  - **Interval (seconds)**: Tần suất gửi request kiểm tra tính hoạt động (tối thiểu là `60` giây).
  - **Timeout (ms)**: Thời gian chờ phản hồi tối đa trước khi coi là lỗi/ngừng hoạt động (mặc định khuyến nghị `10000`ms hoặc `5000`ms).
  - **Các tùy chọn bổ sung cho HTTP (nếu cần)**:
    - *HTTP Method*: GET, HEAD, POST, PUT, DELETE.
    - *Headers*: Truyền các headers bổ sung dạng JSON (Ví dụ: Authorization token).
    - *Expected status codes*: Danh sách mã trạng thái thành công mong muốn dưới dạng JSON (Ví dụ: `[200, 204, 301]`).
    - *Expected Keyword*: Từ khóa bắt buộc phải xuất hiện trong body phản hồi để được coi là thành công.
    - *Forbidden Keyword*: Từ khóa không được xuất hiện trong body phản hồi.

### Bước 3: Lưu và theo dõi kết quả
- Nhấn **Save** (Lưu) để lưu cấu hình. 
- Hệ thống sẽ tự động lên lịch gửi các yêu cầu kiểm tra (HTTP fetch hoặc TCP connect) theo chu kỳ `Interval` bạn đã cài đặt.
- Trạng thái hoạt động (UP/DOWN) và thời gian phản hồi (Latency) sẽ hiển thị trực quan thông qua các thanh biểu đồ nhịp tim trên Trang trạng thái chính (Status Page) và hệ thống Analytics của Admin.
- Bạn có thể nhấn nút **Test** trực tiếp trong trang quản trị của Monitor đó để chạy kiểm tra thử ngay lập tức mà không cần đợi.
