# Đóng góp cho Uptimer

English | [中文](CONTRIBUTING.zh-CN.md) | [Tiếng Việt](CONTRIBUTING.vi-VN.md)

Cảm ơn bạn đã quan tâm đến việc đóng góp! Hướng dẫn này bao gồm các thông tin cơ bản.

## Cài đặt Môi trường Phát triển

```bash
# Yêu cầu: Node.js >= 22.14.0, pnpm >= 10.8.1

git clone https://github.com/VrianCao/Uptimer.git
cd Uptimer
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
pnpm dev
```

Xem [Develop/LOCAL-TESTING.md](Develop/LOCAL-TESTING.md) để biết hướng dẫn phát triển cục bộ đầy đủ.

## Thực hiện Thay đổi

1. Tạo một nhánh từ `master`
2. Thực hiện các thay đổi của bạn, giữ chúng nhỏ gọn và tập trung
3. Đảm bảo các bài kiểm tra chất lượng đều vượt qua:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm format:check
   ```
4. Nếu bạn thay đổi lược đồ D1, hãy thêm một file migration **mới** (tuyệt đối không sửa đổi các migrations đã có)
5. Mở một pull request

## Phong cách Code

- Chế độ strict của TypeScript được áp dụng trên tất cả các package
- Việc định dạng (formatting) được xử lý bởi Prettier — hãy chạy `pnpm format` trước khi commit
- Các quy tắc Lint được định nghĩa trong `eslint.config.mjs`

## Lưu ý về Kiến trúc

Trước khi thực hiện thay đổi, hãy xem xét các tài liệu sau:

- [Develop/Application.md](Develop/Application.md) — Đặc tả sản phẩm và các ràng buộc kỹ thuật
- [Develop/Structure.md](Develop/Structure.md) — Cấu trúc thư mục và ranh giới các module
- [AGENTS.md](AGENTS.md) — Hướng dẫn phối hợp

Các quy ước chính:

- Tất cả đầu vào API đều được xác thực với Zod
- Tất cả các thao tác ghi DB đều sử dụng truy vấn có tham số (Drizzle ORM)
- Các type dùng chung được đặt trong `packages/shared`, không sao chép lại trên nhiều app
- API route được đặt trong `apps/worker/src/routes/` — logic nghiệp vụ nằm trong các domain module

## Báo cáo Lỗi

Khi gửi báo cáo lỗi, vui lòng bao gồm:

- Các bước để tái hiện
- Hành vi mong đợi vs hành vi thực tế
- Các log hoặc thông báo lỗi liên quan
- Phương thức triển khai của bạn (phát triển cục bộ, GitHub Actions, thủ công)

## Pull Requests

- Giữ các PR nhỏ gọn và tập trung vào một vấn đề duy nhất
- Bao gồm mô tả rõ ràng về những gì đã thay đổi và lý do
- Tham chiếu đến bất kỳ issue nào liên quan
- Đảm bảo CI vượt qua trước khi yêu cầu review
