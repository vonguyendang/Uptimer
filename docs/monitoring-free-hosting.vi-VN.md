# Hướng Dẫn Cấu Hình Uptimer Cho Free Hosting (InfinityFree, ByetHost, iFastNet...)

Tài liệu này hướng dẫn cách vượt qua hệ thống chống bot của các dịch vụ hosting miễn phí để theo dõi tình trạng Website (Uptime) một cách chính xác.

## Vấn Đề Gặp Phải
Các dịch vụ hosting miễn phí thuộc hệ sinh thái của **iFastNet** (bao gồm **InfinityFree**, **ByetHost**, **ProFreeHost**, v.v.) thường trang bị hệ thống tường lửa chống bot tự động.

- Khi có truy cập vào tên miền, máy chủ sẽ chặn lại và trả về một trang web trắng có mã **HTTP 200 OK**.
- Trang này chứa một đoạn mã Javascript yêu cầu trình duyệt giải mã AES, tạo cookie `__test=...`, sau đó tự động tải lại (redirect) về trang web thật hoặc trang đình chỉ (Suspended).
- Các hệ thống theo dõi uptime tự động (như Uptimer) chạy ở tầng Network, **không thể thực thi Javascript**. Do đó, Uptimer sẽ luôn bị kẹt ở trang chờ 200 OK này. Dù web bạn sống hay bị khoá, Uptimer vẫn thấy 200 OK và báo là **UP**.

Dưới đây là 2 phương pháp hoàn hảo nhất để vượt qua giới hạn này.

---

## Cách 1: Giả Danh Googlebot (Khuyên Dùng)

Phương pháp này là tốt nhất vì bạn giữ nguyên được URL trang chủ của mình. Các hosting này có "luật ngầm" cho phép bot của Google đi qua tường lửa mà không cần giải mã Javascript để web còn được SEO (lên top tìm kiếm).

### Các bước thiết lập
1. Thêm Monitor mới hoặc sửa Monitor hiện tại.
2. **URL:** Nhập đường dẫn web của bạn bình thường (Ví dụ: `https://cp.ignito.site`)
3. Tích mở **Advanced HTTP options**:
   - **Follow redirects:** BỎ CHỌN (Uncheck).
   - **Expected Status Codes:** `200`
   - **Headers (JSON):** Nhập chính xác mã giả danh Googlebot:
     ```json
     {
       "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"
     }
     ```
   - **Response Must Not Contain / Must Contain:** Bỏ trống toàn bộ.

### Cách hoạt động
Khi giả danh Googlebot, nếu web bạn đang hoạt động, hosting sẽ trả về 200 OK thẳng nội dung thật -> Báo **UP**. Khi web bạn bị khóa (Suspended), hosting sẽ trả về mã chuyển hướng 302 thay vì kiểm tra JS -> Khác với mã 200 mong đợi -> Lập tức báo **DOWN**.

---

## Cách 2: Sử Dụng File robots.txt

Hệ thống chống bot AES thường chỉ chặn các trang HTML/PHP (`/`, `index.php`...), nhưng nó sẽ luôn cho phép (bypass) truy cập trực tiếp vào các file tĩnh dùng cho máy tìm kiếm như `/robots.txt`.

### Các bước thiết lập
1. Thêm Monitor mới hoặc sửa Monitor hiện tại.
2. **URL:** Nhập đường dẫn web của bạn và thêm `/robots.txt` vào cuối (Ví dụ: `https://cp.ignito.site/robots.txt`)
3. Tích mở **Advanced HTTP options**:
   - **Follow redirects:** BỎ CHỌN (Uncheck).
   - **Expected Status Codes:** `200, 404` (Nếu web bạn chưa tạo file robots.txt thì nó trả 404, bạn điền 404 để Uptimer hiểu là web vẫn sống).
   - **Headers (JSON):** Bỏ trống.
   - **Response Must Not Contain / Must Contain:** Bỏ trống toàn bộ.

### Cách hoạt động
Nếu web bình thường, việc truy cập `robots.txt` sẽ trả về mã 200 (nếu có file) hoặc 404 (nếu không có) -> Báo **UP**. Khi web bị Suspended, máy chủ can thiệp và trả về mã 302 chuyển hướng mọi file sang trang đình chỉ -> Lỗi 302 không nằm trong cho phép (200, 404) -> Lập tức báo **DOWN**.

---

> [!TIP]
> **Khuyên dùng:** Bạn nên ưu tiên **Cách 1**, vì nó giám sát thẳng trang chủ của bạn thay vì một file tĩnh rỗng, qua đó giúp bạn thấy được Latency (độ trễ) phản hồi từ code trang chủ chính xác hơn.
