# 通知系统

[English](notifications.md) | 中文 | [Tiếng Việt](notifications.vi-VN.md)

Uptimer 的通知系统在监控状态变化或事件创建/更新时发送通知。本文档涵盖事件类型、渠道类型、渠道配置、Payload 构建、模板变量、Webhook 签名与故障排除。

## 概览

通知系统的核心能力：

- 在关键状态变化（UP→DOWN、DOWN→UP）和事件生命周期事件时发送通知
- 支持三种渠道类型：**Webhook、Email 和 Telegram**
- 每个渠道独立配置：事件过滤、模板、类型专属设置
- 幂等投递保证：每个事件对每个渠道最多发送一次（通过 `notification_deliveries` 唯一约束实现）

### 核心流程

1. 系统产生事件（eventType + eventKey + payload）
2. 查找所有活跃的渠道（webhook + email + telegram）
3. 对每个渠道：
   - 按 `enabled_events` 过滤
   - 在 `notification_deliveries` 中占位（幂等 claim）
   - 渲染模板（message、payload/body、headers）
   - 通过对应发送器发送（fetch / Resend API / Telegram Bot API）
   - 记录投递结果（success/failed）

## 事件类型

| 事件                  | 说明                             |
| --------------------- | -------------------------------- |
| `monitor.down`        | 监控项转为 DOWN 状态             |
| `monitor.up`          | 监控项转为 UP 状态               |
| `incident.created`    | 新事件创建                       |
| `incident.updated`    | 事件收到更新                     |
| `incident.resolved`   | 事件被标记为已解决               |
| `maintenance.started` | 维护窗口开始                     |
| `maintenance.ended`   | 维护窗口结束                     |
| `test.ping`           | 测试按钮（即使被过滤也始终允许） |

## 事件键（幂等）

每个事件都有唯一的 `event_key` 用于去重：

- 监控：`monitor:<monitorId>:down|up:<timestamp>`
- 事件：`incident:<incidentId>:created|resolved:<...>` 或 `incident:<incidentId>:update:<updateId>`
- 测试：`test:webhook:<channelId>:<now>`

> 如果在同一秒内连续点击测试按钮，第二次请求可能被去重跳过。等待 1 秒后重试即可。

## 管理端 API

| 方法   | 端点                                           | 说明         |
| ------ | ---------------------------------------------- | ------------ |
| GET    | `/api/v1/admin/notification-channels`          | 列出所有渠道 |
| POST   | `/api/v1/admin/notification-channels`          | 创建渠道     |
| PATCH  | `/api/v1/admin/notification-channels/:id`      | 更新渠道     |
| DELETE | `/api/v1/admin/notification-channels/:id`      | 删除渠道     |
| POST   | `/api/v1/admin/notification-channels/:id/test` | 发送测试通知 |

测试端点会生成一个 `test.ping` 事件（带示例数据）并返回投递记录，用于调试。

## 渠道配置

所有渠道共享以下字段：

| 字段             | 必填 | 默认值 | 说明                                                       |
| ---------------- | ---- | ------ | ---------------------------------------------------------------- |
| `name`           | 是   | —      | 显示名称                                                         |
| `type`           | 是   | —      | `webhook`、`email` 或 `telegram`                                |
| `is_active`      | 否   | `true` | 是否接收投递                                                     |
| `config_json`    | 是   | —      | 类型専属的 JSON 对象（详见下方各节）                         |
| `enabled_events` | 否   | —      | 事件白名单数组，存储在 `config_json` 中。空 = 全部事件。        |

### Webhook `config_json` 字段

| 字段               | 必填 | 默认值 | 说明                                                                   |
| ------------------ | ---- | ------ | ---------------------------------------------------------------------- |
| `url`              | 是   | —      | Webhook URL（仅允许 `http://` 或 `https://`）                          |
| `method`           | 否   | `POST` | HTTP 方法：`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`             |
| `headers`          | 否   | —      | 自定义 Headers 对象 `{ "Header-Name": "value" }`。Value 支持模板渲染。 |
| `timeout_ms`       | 否   | —      | 请求超时（1–60000 ms）                                                 |
| `payload_type`     | 否   | `json` | `json`、`param` 或 `x-www-form-urlencoded`                             |
| `message_template` | 否   | —      | `message` 变量的模板                                                   |
| `payload_template` | 否   | —      | 自定义 Payload 模板（详见下文）                                        |
| `enabled_events`   | 否   | —      | 事件白名单数组。空 = 全部事件。`test.ping` 始终通过。                  |
| `signing`          | 否   | —      | `{ enabled: boolean, secret_ref: string }` — HMAC-SHA256 签名          |

### Email `config_json` 字段

Email 通过 [Resend](https://resend.com) 或 [SendGrid](https://sendgrid.com) 发送。两者选配其一。

| 字段               | 必填 | 默认值 | 说明                                                     |
| ------------------ | ---- | ------ | ------------------------------------------------------------ |
| `provider`         | 是   | —      | `resend` 或 `sendgrid`                                       |
| `api_key_ref`      | 是   | —      | 存儲 Resend/SendGrid API Key 的 Worker Secret 名称          |
| `from`             | 是   | —      | 发件人地址，如 `Uptimer <alerts@example.com>`              |
| `to`               | 是   | —      | 收件人邮筱地址数组（1–10 个）                              |
| `subject_template` | 否   | —      | 邮件主题模板，支持 `{{variable}}`                    |
| `message_template` | 否   | —      | `message` 变量的模板，用于邮件正文                       |
| `enabled_events`   | 否   | —      | 事件白名单数组。空 = 全部事件。`test.ping` 始终通过。  |

**示例：**

```json
{
  "provider": "resend",
  "api_key_ref": "RESEND_API_KEY",
  "from": "Uptimer <alerts@example.com>",
  "to": ["ops@example.com"],
  "subject_template": "[{{event}}] {{monitor.name}} 当前状态 {{state.status}}",
  "message_template": "监控项 **{{monitor.name}}** 现在是 {{state.status}}。"
}
```

> Worker Secret 名称（如 `RESEND_API_KEY`）必须在 Cloudflare Worker Secrets 中配置，或在本地开发时存入 `.dev.vars`。永远不要硬编码 API Key。

### Telegram `config_json` 字段

Telegram 消息通过 [Bot API](https://core.telegram.org/bots/api) 的 `sendMessage` 发送。

| 字段               | 必填 | 默认值       | 说明                                                                     |
| ------------------ | ---- | ---------- | -------------------------------------------------------------------------- |
| `bot_token_ref`    | 是   | —          | 存储 Bot Token（`123456:ABC-def...`）的 Worker Secret 名称             |
| `chat_id`          | 是   | —          | Telegram Chat ID（用户、群组或频道）。超级群组为负数。                    |
| `parse_mode`       | 否   | `Markdown` | `Markdown`、`MarkdownV2` 或 `HTML`                                        |
| `message_template` | 否   | —          | 消息模板，支持 `{{variable}}`                                           |
| `enabled_events`   | 否   | —          | 事件白名单数组。空 = 全部事件。`test.ping` 始终通过。              |

**示例：**

```json
{
  "bot_token_ref": "TELEGRAM_BOT_TOKEN",
  "chat_id": "-1001234567890",
  "parse_mode": "Markdown",
  "message_template": "*[{{event}}]* `{{monitor.name}}` 状态：*{{state.status}}*"
}
```

> 获取 `chat_id`：将 Bot 添加到群组/频道后发送任意消息，然后访问 `https://api.telegram.org/bot<TOKEN>/getUpdates`，读取 `chat.id` 字段。


## Payload 模式

### 模式 1：默认 JSON（无模板）

当 `payload_type = json` 且未设置 `payload_template` 时，Uptimer 发送完整的系统 Payload：

```json
{
  "event": "monitor.down",
  "event_id": "monitor:1:down:1700000000",
  "timestamp": 1700000000,
  "monitor": { "id": 1, "name": "..." },
  "state": { "status": "down", "http_status": 500 }
}
```

所有字段完整，数字类型保持不变。

### 模式 2：自定义模板

设置了 `payload_template` 时，渲染后的模板即为最终 Payload。系统字段 **不会** 自动注入 — 需在模板中显式引用：

```json
{
  "event": "{{event}}",
  "event_id": "{{event_id}}",
  "text": "{{message}}",
  "monitor_name": "{{monitor.name}}"
}
```

### 模式 3：最小扁平 Payload（非 JSON 无模板）

当 `payload_type` 为 `param` 或 `x-www-form-urlencoded` 且未设置模板时：

```
event, event_id, timestamp, message
```

## 模板系统

模板可用于 `message_template`、`payload_template` 中的所有字符串字段、以及 `headers` 中的所有 value。

### 语法

- `{{path.to.field}}` — 点号路径取值
- `{{checks[0].latency_ms}}` — 数组下标访问
- `$MSG` — 渲染后 `message` 的别名

### 内置变量

| 变量              | 类型   | 说明                                                 |
| ----------------- | ------ | ---------------------------------------------------- |
| `event`           | string | 事件类型                                             |
| `event_id`        | string | 幂等键                                               |
| `timestamp`       | number | Unix 秒                                              |
| `channel.id`      | number | 渠道 ID                                              |
| `channel.name`    | string | 渠道名称                                             |
| `monitor.*`       | object | 监控项字段（如适用）                                 |
| `state.*`         | object | 监控状态字段（如适用）                               |
| `default_message` | string | 系统生成的默认消息                                   |
| `message`         | string | 最终消息（若设置了 `message_template` 则为渲染结果） |

> 系统原始 Payload 会展开到顶层变量。如果 Payload 包含 `monitor`，可直接使用 `{{monitor.name}}`。

### 缺失字段

路径不存在时，模板解析为空字符串。

### 安全限制

模板路径拒绝访问 `__proto__`、`prototype` 和 `constructor`，防止原型链污染。

### 类型说明

模板替换本质是字符串替换。`"id": "{{monitor.id}}"` 最终变为 `"id": "12"`（字符串），而非数字 `12`。如果需要数字类型，请使用默认 Payload（不设置模板）或在接收端做类型转换。

## Payload Type 详解

### `json`

- Body：`JSON.stringify(payload)`
- 默认 Header：`Content-Type: application/json`（为兼容性不附加 `charset=utf-8`）
- 如在 `headers` 中手动设置了 `Content-Type`，则不会被覆盖

### `param`

- Payload（必须是扁平对象）转换为查询参数拼接到 URL 上
- 不发送请求 body

### `x-www-form-urlencoded`

- POST/PUT/PATCH/DELETE：body 为 `URLSearchParams`，Header `Content-Type: application/x-www-form-urlencoded`
- GET/HEAD：退化为查询参数（无 body）

## Webhook 签名

当 `signing.enabled = true` 时，Uptimer 在每个请求中附加两个 Header：

```
X-Uptimer-Timestamp: <unix_seconds>
X-Uptimer-Signature: sha256=<hmac_hex>
```

**签名计算**：

- `message = "<timestamp>.<rawBody>"`
- `hmac = HMAC-SHA256(secret, message)` 的十六进制值

Secret 从 Worker 环境变量中读取（由 `secret_ref` 指定），永远不会存入数据库。

### 验证示例（Node.js）

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

## 配置示例

### 通过 Apprise 推送到 Discord / Slack / ntfy

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

### 查询参数 Webhook (GET)

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

### 表单编码 Webhook (POST)

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

## 故障排除

### 检查测试 API 返回

使用管理后台的测试按钮或直接调用 API：

```
POST /api/v1/admin/notification-channels/:id/test
```

返回内容包含：

- `delivery.status` — `success` 或 `failed`
- `delivery.http_status` — HTTP 状态码（网络错误时可能为 null）
- `delivery.error` — 错误描述

**常见错误**：

- `HTTP 400/415`：接收端拒绝 Content-Type 或 body 结构
- `Timeout after XXXXms`：接收端响应慢或不可达
- `Signing secret not configured: XXX`：开启了签名但未配置对应 Secret

### 常见"配置看起来对但不工作"的原因

| 症状                 | 原因                                                             |
| -------------------- | ---------------------------------------------------------------- |
| 接收端收到错误字段   | `payload_template` 中的字段名与接收端期望的不匹配                |
| Content-Type 被拒绝  | 某些接收端要求精确的 `application/json` — 非必要不要覆盖 headers |
| 真实事件未投递       | `enabled_events` 白名单生效，但未包含该事件类型                  |
| 渠道显示活跃但无投递 | 渠道的 `is_active = false`                                       |
| 重复点击无响应       | 幂等去重 — 同一 `event_key` 在 1 秒内被跳过                      |

### 查询投递记录

在本地 D1 中查看最近的投递记录：

```bash
wrangler d1 execute uptimer --local \
  --command="SELECT * FROM notification_deliveries ORDER BY created_at DESC LIMIT 20;"
```

## 已知限制

- 模板替换本质是字符串替换（详见上方「类型说明」）
- `payload_template` 的 JSON 深度上限为 32 层
- Email 仅通过 HTTPS API（Resend 或 SendGrid）发送，不支持普通 SMTP
- Telegram Bot 必须有权限向目标 Chat/Channel 发送消息

## 源码参考

| 组件         | 文件                                   |
| ------------ | ---------------------------------------- |
| 通知调度器   | `apps/worker/src/notify/dispatch.ts`     |
| Webhook 发送器 | `apps/worker/src/notify/webhook.ts`      |
| Email 发送器   | `apps/worker/src/notify/email.ts`        |
| Telegram 发送器 | `apps/worker/src/notify/telegram.ts`     |
| 幂等去重     | `apps/worker/src/notify/dedupe.ts`       |
| 模板引擎     | `apps/worker/src/notify/template.ts`     |
| 配置 Schema  | `packages/db/src/json.ts`                |
| 测试端点     | `apps/worker/src/routes/admin.ts`        |
