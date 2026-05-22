# Hệ thống Thông báo

[English](notifications.md) | [中文](notifications.zh-CN.md) | Tiếng Việt

Hệ thống thông báo của Uptimer gửi cảnh báo khi trạng thái monitor thay đổi hoặc các sự cố được tạo/cập nhật. Tài liệu này bao gồm các loại sự kiện, loại kênh, cấu hình kênh, xây dựng payload, biến template, ký webhook và cách khắc phục sự cố.

## Tổng quan

Hệ thống thông báo:

- Gửi cảnh báo về các thay đổi trạng thái quan trọng (UP→DOWN, DOWN→UP) và các sự kiện vòng đời sự cố
- Hỗ trợ **ba loại kênh**: Webhook, Email và Telegram
- Hỗ trợ cấu hình theo từng kênh: Lọc sự kiện, template và các thiết lập riêng theo loại kênh
- Đảm bảo tính nhất quán phân phối (idempotent): mỗi sự kiện được gửi tới mỗi kênh tối đa một lần (thông qua ràng buộc duy nhất `notification_deliveries`)

### Luồng xử lý (Flow)

1. Hệ thống tạo ra một sự kiện (eventType + eventKey + payload)
2. Tìm tất cả các kênh đang hoạt động (webhook + email + telegram)
3. Đối với mỗi kênh:
   - Lọc theo `enabled_events`
   - Đăng ký một vị trí gửi trong `notification_deliveries` (idempotent)
   - Render templates (tin nhắn, payload/body, headers)
   - Gửi qua đầu gửi tương ứng (fetch / Resend API / Telegram Bot API)
   - Ghi lại kết quả gửi (thành công/thất bại)

## Các loại Sự kiện (Event Types)

| Sự kiện               | Mô tả                                          |
| --------------------- | ---------------------------------------------- |
| `monitor.down`        | Monitor chuyển sang trạng thái DOWN            |
| `monitor.up`          | Monitor chuyển sang trạng thái UP              |
| `incident.created`    | Sự cố mới được tạo                             |
| `incident.updated`    | Sự cố nhận được cập nhật                       |
| `incident.resolved`   | Sự cố được đánh dấu là đã giải quyết           |
| `maintenance.started` | Thời gian bảo trì bắt đầu                      |
| `maintenance.ended`   | Thời gian bảo trì kết thúc                     |
| `test.ping`           | Nút kiểm tra (luôn cho phép, ngay cả khi bị lọc)|

## Khóa Sự kiện (Event Keys - Idempotency)

Mỗi sự kiện có một `event_key` duy nhất dùng để loại bỏ trùng lặp:

- Monitor: `monitor:<monitorId>:down|up:<timestamp>`
- Sự cố: `incident:<incidentId>:created|resolved:<...>` hoặc `incident:<incidentId>:update:<updateId>`
- Test: `test:webhook:<channelId>:<now>`

> Nếu bạn nhấn nút kiểm tra hai lần trong cùng một giây, request thứ hai có thể bị loại bỏ trùng lặp. Vui lòng đợi 1 giây và thử lại.

## Admin API

| Phương thức | Endpoint                                       | Mô tả                    |
| ----------- | ---------------------------------------------- | ------------------------ |
| GET         | `/api/v1/admin/notification-channels`          | Liệt kê tất cả các kênh  |
| POST        | `/api/v1/admin/notification-channels`          | Tạo kênh mới             |
| PATCH       | `/api/v1/admin/notification-channels/:id`      | Cập nhật kênh            |
| DELETE      | `/api/v1/admin/notification-channels/:id`      | Xóa kênh                 |
| POST        | `/api/v1/admin/notification-channels/:id/test` | Gửi thông báo thử nghiệm |

Endpoint kiểm tra tạo ra một sự kiện `test.ping` với dữ liệu mẫu và trả về bản ghi kết quả để debug.

## Cấu hình Kênh

Tất cả các kênh có chung các trường sau:

| Trường         | Bắt buộc | Mặc định | Mô tả                                                                    |
| --------------- | --------- | --------- | ----------------------------------------------------------------------- |
| `name`          | Có        | —         | Tên hiển thị                                                             |
| `type`          | Có        | —         | `webhook`, `email`, hoặc `telegram`                                     |
| `is_active`     | Không     | `true`    | Có nhận phân phối hay không                                              |
| `config_json`   | Có        | —         | Đối tượng JSON đặc thú theo loại (xem các mục bên dưới)                  |
| `enabled_events`| Không     | —         | Mảng danh sách trắng sự kiện lưu trong `config_json`. Rỗng = tất cả.  |

### Trường `config_json` của Webhook

| Trường             | Bắt buộc | Mặc định | Mô tả                                                                                  |
| ------------------ | --------- | --------- | -------------------------------------------------------------------------------------- |
| `url`              | Có       | —        | Webhook URL (chỉ `http://` hoặc `https://`)                                            |
| `method`           | Không    | `POST`   | Phương thức HTTP: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`                      |
| `headers`          | Không    | —        | Đối tượng headers tùy chỉnh `{ "Header-Name": "value" }`. Các giá trị hỗ trợ template. |
| `timeout_ms`       | Không    | —        | Thời gian chờ cho yêu cầu (1–60000 ms)                                                 |
| `payload_type`     | Không    | `json`   | `json`, `param`, hoặc `x-www-form-urlencoded`                                          |
| `message_template` | Không    | —        | Template cho biến `message`                                                            |
| `payload_template` | Không    | —        | Template payload tùy chỉnh (xem bên dưới)                                              |
| `enabled_events`   | Không    | —        | Mảng danh sách trắng các sự kiện. Rỗng = tất cả sự kiện. `test.ping` luôn được phép.   |
| `signing`          | Không    | —        | `{ enabled: boolean, secret_ref: string }` — Ký bằng HMAC-SHA256                       |

### Trường `config_json` của Email

Email được gửi qua [Resend](https://resend.com) hoặc [SendGrid](https://sendgrid.com). Bạn cần cấu hình một trong hai.

| Trường              | Bắt buộc | Mặc định | Mô tả                                                                          |
| ------------------- | --------- | --------- | ---------------------------------------------------------------------------- |
| `provider`          | Có        | —         | `resend` hoặc `sendgrid`                                                     |
| `api_key_ref`       | Có        | —         | Tên Worker secret chứa API key của Resend/SendGrid                          |
| `from`              | Có        | —         | Địa chỉ người gửi, ví dụ: `Uptimer <alerts@example.com>`                    |
| `to`                | Có        | —         | Mảng các địa chỉ email người nhận (1–10 địa chỉ)                               |
| `subject_template`  | Không     | —         | Template tiêu đề email. Hỗ trợ `{{biến}}`.                                     |
| `message_template`  | Không     | —         | Template cho biến `message` dùng trong nội dung email                          |
| `enabled_events`    | Không     | —         | Mảng danh sách trắng các sự kiện. Rỗng = tất cả. `test.ping` luôn được phép. |

**Ví dụ:**

```json
{
  "provider": "resend",
  "api_key_ref": "RESEND_API_KEY",
  "from": "Uptimer <alerts@example.com>",
  "to": ["ops@example.com"],
  "subject_template": "[{{event}}] {{monitor.name}} đang {{state.status}}",
  "message_template": "Monitor **{{monitor.name}}** hiện đang {{state.status}}."
}
```

> Tên Worker secret (ví dụ `RESEND_API_KEY`) phải được thiết lập trong Cloudflare Worker Secrets hoặc trong `.dev.vars` cho môi trường phát triển local. Không bao giờ hardcode API key.

### Trường `config_json` của Telegram

Tin nhắn Telegram được gửi qua [Bot API](https://core.telegram.org/bots/api) bằng phương thức `sendMessage`.

| Trường              | Bắt buộc | Mặc định   | Mô tả                                                                              |
| ------------------- | --------- | ----------- | -------------------------------------------------------------------------------- |
| `bot_token_ref`     | Có        | —           | Tên Worker secret chứa Bot token (`123456:ABC-def...`)                           |
| `chat_id`           | Có        | —           | ID chat Telegram (người dùng, nhóm, hoặc kênh). Số âm cho supergroup.           |
| `parse_mode`        | Không     | `Markdown`  | `Markdown`, `MarkdownV2`, hoặc `HTML`                                            |
| `message_template`  | Không     | —           | Template nội dung tin nhắn. Hỗ trợ `{{biến}}`.                                   |
| `enabled_events`    | Không     | —           | Mảng danh sách trắng các sự kiện. Rỗng = tất cả. `test.ping` luôn được phép. |

**Ví dụ:**

```json
{
  "bot_token_ref": "TELEGRAM_BOT_TOKEN",
  "chat_id": "-1001234567890",
  "parse_mode": "Markdown",
  "message_template": "*[{{event}}]* `{{monitor.name}}` đang *{{state.status}}*"
}
```

> Để lấy `chat_id`: thêm bot vào nhóm/kênh, gửi một tin nhắn, sau đó gọi `https://api.telegram.org/bot<TOKEN>/getUpdates` và đọc trường `chat.id`.


## Các Chế độ Payload

### Chế độ 1: JSON Mặc định (không có template)

Khi `payload_type = json` và không có `payload_template` nào được đặt, Uptimer sẽ gửi toàn bộ payload của hệ thống:

```json
{
  "event": "monitor.down",
  "event_id": "monitor:1:down:1700000000",
  "timestamp": 1700000000,
  "monitor": { "id": 1, "name": "..." },
  "state": { "status": "down", "http_status": 500 }
}
```

Tất cả các trường đều có mặt và kiểu dữ liệu số được bảo toàn.

### Chế độ 2: Template Tùy chỉnh

Khi `payload_template` được thiết lập, template được render ra sẽ trở thành payload. Các trường hệ thống **không** tự động chèn vào — bạn phải liệt kê chúng một cách rõ ràng:

```json
{
  "event": "{{event}}",
  "event_id": "{{event_id}}",
  "text": "{{message}}",
  "monitor_name": "{{monitor.name}}"
}
```

### Chế độ 3: Payload phẳng, tối giản (không phải JSON, không có template)

Khi `payload_type` là `param` hoặc `x-www-form-urlencoded` và không có template nào được cài đặt:

```
event, event_id, timestamp, message
```

## Hệ thống Template

Các template có thể được dùng trong `message_template`, trong tất cả các trường kiểu chuỗi của `payload_template`, và tất cả giá trị của header.

### Cú pháp

- `{{path.to.field}}` — Tìm kiếm theo cú pháp dấu chấm
- `{{checks[0].latency_ms}}` — Truy cập chỉ mục mảng
- `$MSG` — Bí danh (alias) cho biến `message` sau khi render

### Các Biến Tích hợp sẵn

| Biến              | Kiểu   | Mô tả                                                   |
| ----------------- | ------ | ------------------------------------------------------- |
| `event`           | string | Loại sự kiện                                            |
| `event_id`        | string | Khóa loại bỏ trùng lặp                                  |
| `timestamp`       | number | Giây Unix                                               |
| `channel.id`      | number | ID Kênh                                                 |
| `channel.name`    | string | Tên Kênh                                                |
| `monitor.*`       | object | Các trường Monitor (nếu áp dụng)                        |
| `state.*`         | object | Các trường trạng thái Monitor (nếu áp dụng)             |
| `default_message` | string | Thông báo mặc định do hệ thống sinh ra                  |
| `message`         | string | Thông báo cuối cùng (được render từ `message_template`) |

> Raw payload của hệ thống được trải phẳng vào các biến cấp cao nhất. Nếu payload chứa `monitor`, bạn có thể truy cập `{{monitor.name}}` trực tiếp.

### Trường bị Thiếu

Nếu một đường dẫn không tồn tại, template sẽ resolve thành một chuỗi rỗng.

### Bảo mật

Đường dẫn template từ chối truy cập tới `__proto__`, `prototype`, và `constructor` để ngăn chặn prototype pollution.

### Lưu ý về Kiểu Dữ liệu

Sự thay thế template luôn tạo ra chuỗi (string). `"id": "{{monitor.id}}"` trở thành `"id": "12"` (string), không phải `12` (number). Nếu bạn cần dữ liệu số, hãy sử dụng payload mặc định (không template) hoặc tự chuyển đổi ở phía nhận.

## Chi tiết các Loại Payload

### `json`

- Body: `JSON.stringify(payload)`
- Header mặc định: `Content-Type: application/json` (không gắn `charset=utf-8` để duy trì khả năng tương thích)
- Nếu có `Content-Type` tùy chỉnh trong `headers`, ưu tiên sử dụng nó

### `param`

- Payload (phải là một object phẳng) được chuyển thành các tham số truy vấn (query parameters) nối vào URL
- Không có request body

### `x-www-form-urlencoded`

- POST/PUT/PATCH/DELETE: body là `URLSearchParams`, header `Content-Type: application/x-www-form-urlencoded`
- GET/HEAD: tự động dùng query parameters (không có body)

## Ký Webhook (Webhook Signing)

Khi `signing.enabled = true`, Uptimer thêm hai headers vào mỗi request:

```
X-Uptimer-Timestamp: <unix_seconds>
X-Uptimer-Signature: sha256=<hmac_hex>
```

**Cách tính chữ ký**:

- `message = "<timestamp>.<rawBody>"`
- `hmac = HMAC-SHA256(secret, message)` định dạng hex

Mã bí mật (secret) được đọc từ biến môi trường của Worker do `secret_ref` chỉ định. Nó không bao giờ được lưu trong database.

### Ví dụ Xác minh (Node.js)

```js
import crypto from 'node:crypto';

function verify(req, secret) {
  const ts = req.headers['x-uptimer-timestamp'];
  const sig = req.headers['x-uptimer-signature']; // "sha256=..."
  const rawBody = req.rawBody ?? '';
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return sig === `sha256=${expected}`;
}
```

## Các Ví dụ Cấu hình

### Discord / Slack / ntfy qua Apprise

```json
{
  "url": "https://your-apprise-endpoint/notify",
  "method": "POST",
  "payload_type": "json",
  "message_template": "[{{event}}] {{monitor.name}} => {{state.status}}\n$MSG",
  "payload_template": {
    "urls": "ntfys://your-ntfy-topic",
    "body": "{{message}}"
  }
}
```

### Query Parameter Webhook (GET)

```json
{
  "url": "https://example.com/webhook",
  "method": "GET",
  "payload_type": "param",
  "payload_template": {
    "event": "{{event}}",
    "monitor": "{{monitor.name}}",
    "msg": "{{message}}"
  }
}
```

### Form-encoded Webhook (POST)

```json
{
  "url": "https://example.com/webhook",
  "method": "POST",
  "payload_type": "x-www-form-urlencoded",
  "payload_template": {
    "event": "{{event}}",
    "msg": "{{message}}"
  }
}
```

## Khắc phục Sự cố

### Kiểm tra Phản hồi API Thử nghiệm

Sử dụng nút kiểm tra trong admin dashboard hoặc gọi trực tiếp API:

```
POST /api/v1/admin/notification-channels/:id/test
```

Phản hồi bao gồm:

- `delivery.status` — `success` hoặc `failed`
- `delivery.http_status` — Mã trạng thái HTTP (có thể là null nếu lỗi mạng)
- `delivery.error` — Mô tả lỗi

**Các lỗi phổ biến**:

- `HTTP 400/415`: Đầu nhận từ chối content-type hoặc cấu trúc body
- `Timeout after XXXXms`: Đầu nhận phản hồi quá chậm hoặc không thể truy cập
- `Signing secret not configured: XXX`: Đã bật ký dữ liệu nhưng không tìm thấy secret được tham chiếu

### Những Vấn đề "Trông Có Vẻ Đúng Nhưng Không Chạy"

| Triệu chứng                              | Nguyên nhân                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Đầu nhận nhận sai trường dữ liệu         | Các khóa trong `payload_template` không khớp với những gì receiver mong muốn              |
| Content-Type bị từ chối                  | Vài receiver yêu cầu chính xác `application/json` — không ghi đè headers trừ khi bắt buộc |
| Sự kiện thực tế không được gửi           | Mảng `enabled_events` (whitelist) đang hoạt động nhưng không chứa loại sự kiện đó         |
| Kênh báo hoạt động nhưng không gửi       | `is_active = false` trên kênh                                                             |
| Bấm nhiều lần nhưng không có tác dụng    | Loại bỏ trùng lặp (Idempotent dedup) — trùng `event_key` trong vòng 1 giây sẽ bị bỏ qua   |

### Truy vấn Bản ghi Phân phối (Delivery Records)

Kiểm tra các lần gửi gần đây trong D1 cục bộ của bạn:

```bash
wrangler d1 execute uptimer --local \
  --command="SELECT * FROM notification_deliveries ORDER BY created_at DESC LIMIT 20;"
```

## Các Hạn chế Hiện tại

- Việc thay thế template luôn tạo ra chuỗi (xem Lưu ý về Kiểu Dữ liệu bên trên)
- Độ sâu của `payload_template` dạng JSON bị giới hạn ở mức 32 cấp
- Gửi email chỉ qua HTTPS API (Resend hoặc SendGrid); không hỗ trợ SMTP thường
- Bot Telegram phải có quyền đăng tin trong chat/kênh mục tiêu

## Tham chiếu Mã nguồn

| Thành phần          | File                                   |
| ------------------- | -------------------------------------- |
| Bộ điều phối thông báo | `apps/worker/src/notify/dispatch.ts`   |
| Webhook sender      | `apps/worker/src/notify/webhook.ts`    |
| Email sender        | `apps/worker/src/notify/email.ts`      |
| Telegram sender     | `apps/worker/src/notify/telegram.ts`   |
| Idempotent dedup    | `apps/worker/src/notify/dedupe.ts`     |
| Template engine     | `apps/worker/src/notify/template.ts`   |
| Cấu trúc dữ liệu   | `packages/db/src/json.ts`              |
| Test endpoint       | `apps/worker/src/routes/admin.ts`      |
