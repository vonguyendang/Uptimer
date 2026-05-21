# AGENTS.md: Thỏa thuận Làm việc cho Uptimer

Hướng dẫn dành cho các trợ lý mã nguồn (code assistants) và tác nhân tự động hóa (automation agents) làm việc trong kho lưu trữ này.

---

## 1. Yêu cầu Đọc trước

Trước khi thực hiện bất kỳ thay đổi nào (mã nguồn, cấu hình, hoặc các lệnh có tính phá hủy), hãy đọc và hiểu rõ:

- `AGENTS.md` (tệp này)
- `Develop/Application.md` (đặc tả sản phẩm & ràng buộc kỹ thuật)
- `Develop/Structure.md` (cấu trúc thư mục & ranh giới module)
- `Develop/Plan.md` (các mốc tiến độ & tiêu chí chấp nhận)
- `Develop/API-Reference.md` (Tài liệu tham khảo API Cloudflare / D1 / outbound)
- `Develop/Local-Development-Experience.md` (chỉ áp dụng cục bộ, bị gitignore; bắt buộc khi tồn tại; chứa các ghi chú vận hành như vị trí token, cách dùng `.env`, quy tắc lấy mẫu Tail/Trace và lưu ý về luồng công việc Dev/Production)

Nếu tài liệu có sự xung đột với tác vụ hiện tại, hãy dừng lại và thống nhất trước khi tiếp tục. Tuyệt đối không sao chép các giá trị bí mật từ tài liệu trải nghiệm phát triển cục bộ vào các tệp theo dõi (tracked files), chat, log, PR hoặc issue.

---

## 2. Ngăn xếp Công nghệ (Cố định)

Không đưa vào các công nghệ thay thế mà không có sự phê duyệt rõ ràng.

- **Frontend (Pages)**: React + Vite + TypeScript + Tailwind + React Router + TanStack Query + Recharts
- **Backend (Workers)**: TypeScript + Hono + Zod
- **Database**: Cloudflare D1 + Drizzle ORM; migrations thông qua Wrangler D1 (SQL)
- **Auth**: Admin Bearer Token (lưu trữ trong Workers Secret)

Bất kỳ dependency hoặc dịch vụ mới nào (Queues, DO, R2, v.v.) đều cần có sự biện minh bằng văn bản về: lý do cần thiết, tại sao các giải pháp thay thế không hiệu quả, và phạm vi tác động.

---

## 3. Quy tắc Kho lưu trữ (Repository Rules)

- **Không sửa đổi** thư mục dự án tham khảo (read-only).
- Mặc định sử dụng repo kép: `origin` là Repo Chính, `dev` là Repo Phát triển. Việc ghi vào Repo Chính (`push`, hợp nhất PR, bình luận/đóng issue, chỉnh sửa release) và ghi vào production Cloudflare đòi hỏi sự ủy quyền rõ ràng từ người dùng. Không bao giờ push trực tiếp lên `origin/master`; các bản release chính phải đi qua PR.
- Tất cả các API bên ngoài phải tuân theo quy ước trong `Develop/Application.md` (đường dẫn, trường thời gian, định dạng lỗi).
- Mọi dữ liệu đầu vào phải được kiểm tra (validate) bằng Zod tại thời điểm runtime — không bao giờ tin tưởng các trường JSON từ client hoặc DB.
- Tất cả các thao tác ghi DB phải sử dụng truy vấn có tham số (parameterized queries) (Drizzle hoặc prepared statements của D1). Không nối chuỗi SQL.
- Các đầu dò giám sát (monitoring probes) HTTP phải vô hiệu hóa bộ nhớ đệm (caching) một cách rõ ràng (`no-store` + `cf.cacheTtlByStatus`).

---

## 4. Ưu tiên Triển khai

Tuân thủ nghiêm ngặt `Develop/Plan.md` từ Phase 0 đến Phase 7:

- Worker + D1 phải hoạt động tốt (bao gồm cả các scheduled triggers) trước khi xây dựng toàn bộ giao diện người dùng (UI).
- Giám sát HTTP/TCP và tính chính xác của cỗ máy trạng thái (state machine) cần được thực hiện trước tính năng phân tích nâng cao hoặc đa khu vực (multi-region).

---

## 5. Định nghĩa Hoàn thành (Definition of Done)

Mỗi thay đổi phải:

- Nhỏ gọn và tập trung (không có những thay đổi kiểu "big bang").
- Vượt qua các bài kiểm tra cục bộ (nếu có các script này):
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test` (nếu đã thiết lập)
- Bao gồm một file migration mới cho bất kỳ thay đổi nào về schema D1 (không bao giờ sửa đổi các migrations hiện có).
- Bao gồm các bài test tối thiểu hoặc các bước có thể tái hiện đối với các thay đổi về hành vi.

---

## 6. Tiêu chuẩn Bảo mật

- Các mục tiêu giám sát (monitor targets) được kiểm soát SSRF: hạn chế các giao thức, từ chối các dải IP riêng tư/dành riêng theo mặc định. Phạm vi cổng từ 1-65535 được phép. Xem `Develop/Application.md` để biết thêm chi tiết.
- Admin Token chỉ được lưu trong Workers Secrets hoặc `.dev.vars` (cục bộ). Tuyệt đối không lưu trong Git, D1 hoặc mã nguồn frontend.
- Cấu hình truy cập API Cloudflare cho các hoạt động Phát triển cục bộ (Dev operations) được lưu trữ trong `.env` (bị gitignore). Chỉ tải chúng khi cần thiết cho các lệnh Wrangler; tuyệt đối không in ra, commit, sao chép vào tài liệu hoặc để lộ giá trị token ở đầu ra của các công cụ.
- Các ghi chú vận hành cục bộ thuộc về `Develop/Local-Development-Experience.md` (bị gitignore) và chỉ được phép ghi lại các đường dẫn/quy trình, không bao giờ ghi các giá trị bí mật thực tế.
- Các secret ký webhook (signing secrets) phải tham chiếu đến Worker secrets — không bao giờ lưu trữ trong database.

---

## 7. Định dạng Mô tả Thay đổi

Khi báo cáo các thay đổi, hãy bao gồm:

- **Bạn đã làm gì** (1-3 dòng)
- **Tại sao** (những ràng buộc / rủi ro chính)
- **Ở đâu** (các đường dẫn file / module bị ảnh hưởng)
- **Cách xác minh** (các lệnh hoặc bước thực hiện)
