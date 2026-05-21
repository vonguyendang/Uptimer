# REVIEW.md — Phân tích Khoảng trống & Lộ trình Kế hoạch (Gap Analysis & Roadmap)

> **Trạng thái**: Bản chụp nhanh (Snapshot) ngày 2026-02-04. Các mục được đánh dấu [x] là đã hoàn thành và triển khai.

## Đường cơ sở (Baseline)

Những tính năng dưới đây đã được triển khai và đưa vào hoạt động:

- Worker: API Hono + Zod (`/api/v1/public/*`, `/api/v1/admin/*`), bộ máy giám sát định kỳ (scheduled monitor engine), chính sách lưu giữ dữ liệu (retention), báo cáo cuộn ngày (daily rollups)
- Storage: Lược đồ D1 (schema) + các tệp chuyển đổi (migrations) (monitors/state/results/outages/incidents/maintenance/notifications/settings/snapshots)
- Public: Tính năng ảnh chụp (snapshot) cho trạng thái, tải trọng truyền dữ liệu (payload) cho trang trạng thái (monitors + biểu đồ thời gian hoạt động 30 ngày + sự cố + bảo trì), các endpoint về độ trễ (latency) / thời gian uptime / thời gian sập (outages)
- Admin: Tính năng CRUD cho giám sát (monitor) + kiểm thử (test), tính năng CRUD cho các kênh thông báo + kiểm thử, tính năng CRUD cho sự cố + sửa đổi + xử lý, tính năng CRUD cho các khung bảo trì (maintenance windows), tính năng phân tích hệ thống (analytics) + xuất tệp CSV, hệ thống thiết lập (settings)
- CI/CD: Hoạt động tự động (GitHub Actions) (kiểm tra chuẩn lint + tính tương thích kiểu + kiểm thử unit test + triển khai tự động)

## Những phần còn thiếu (Remaining Gaps)

- [x] ~~Trang hiển thị lịch sử sự kiện trên public status page~~ (Hoàn thiện một phần — có thể thấy các sự kiện đã giải quyết)
- [ ] Biểu đồ thể hiện tim nhịp (heartbeat bar - theo N số lượng kiểm tra trước) của từng loại hình monitor trên Public status page
- [ ] Trình quản lý danh sách thiết lập Admin monitor: Hiển thị hiện trạng runtime (UP/DOWN, lệnh chạy kiểm thử gần đây nhất, báo cáo thời gian chậm trễ và chỉ báo lỗi gần đây nhất)
- [ ] Admin: Tính năng thao tác từ giao diện Tạm dừng/Tiếp tục quá trình hệ thống theo dõi cho các monitors
- [ ] UI lúc tạo Monitor: Cho phép truy cập vào khu vực thiết lập sâu cấu hình HTTP (tiêu đề thiết lập, nội dung, xác nhận chuẩn assertion)
- [ ] Lên kết quả công khai sau tiến hành thử nghiệm trên màn hình thiết lập hệ thống cho UI (đo lường kết quả qua chạy Monitor và chốt truyền webhook)
- [ ] Nút tính năng nhấp xuất (export) báo cáo CSV ở trên Admin UI
- [ ] Cài đặt độ lui lại / vòng lặp lại thời gian khi thực thi tính năng đẩy thông báo cảnh báo gặp sự cố rớt mạng. Tích hợp UI in cấu hình log quá trình hệ thống chuyển tin
- [ ] Tích hợp tính năng chạy Unit Tests đa luồng đảm bảo tính nguyên dạng logic Core mạnh (cơ chế xử lý hệ trạng thái - state machine, thuật toán kiểm định Uptime - uptime math, đánh giá đối tượng kiểm tra - target validation, chức năng định chuẩn cho phần hiển thị templates - notification templates)
