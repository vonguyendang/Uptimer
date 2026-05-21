# Ghi chú Chuẩn bị Phát hành Worker CPU <10ms

> Ngày ghi chú: 2026-04-29
> Ngày cập nhật: 2026-04-30
> Phạm vi áp dụng: Các phương án đã phát hành của Uptimer Worker dưới giới hạn `10ms CPU` của Cloudflare Free Plan
> Main release: PR #77 + PR #78
> Release HEAD: `96f40b2 Merge pull request #78 from VrianCao/release/worker-cpu-10ms-flags`
> Dev/Main: Đã đồng bộ đến `96f40b2`
> Production Tail: Đã vượt qua

---

## 1. Tóm tắt Kết luận

Cả đuôi dữ liệu dài (long Tail) được kiểm soát ở Dev và Tail sau phát hành (post-release) ở production đều đã vượt qua các tiêu chuẩn nghiêm ngặt:

```txt
BAD_OR_GE10 count=0
```

Tệp long Tail cuối cùng:

```txt
tmp/perf-10ms/dev-tail-deep-split-iter5-final-long-20260429140817.jsonl
```

Quy mô lấy mẫu (Sampling scale):

```txt
1200s tail sau khi khởi động (warmup)
Đã phân tích 722 sự kiện Worker
```

Tất cả CPU của các đường dẫn gọi (invocation path) được lấy mẫu đều kiểm soát ở mức `<10ms` một cách nghiêm ngặt, không có mẫu nào đạt mức `10ms` hoặc cao hơn.

Tính chẵn lẻ tuyến đường công khai (public route parity) cuối cùng cũng đã vượt qua:

```txt
/api/v1/public/homepage          200, 26 monitors
/api/v1/public/status            200, 26 monitors
/api/v1/public/homepage-artifact 200, 26 monitors, preload_html present
```

homepage/status vẫn giữ đường dẫn tính toán trước / tĩnh (static / pre-computed), không đưa tính toán trực tiếp (live compute) làm phương án chính.

Production post-release parity:

```txt
/api/v1/public/homepage          200, 6 monitors
/api/v1/public/status            200, 6 monitors
/api/v1/public/homepage-artifact 200, 6 monitors, preload_html present
```

---

## 2. Dữ liệu long Tail cuối cùng

Tệp Tail:

```txt
tmp/perf-10ms/dev-tail-deep-split-iter5-final-long-20260429140817.jsonl
```

Tổng thể:

```txt
objects=722
BAD_OR_GE10 count=0
```

Thống kê theo đường dẫn (Path statistics):

| Đường dẫn (Invocation path)                              |   n | p95 | p99 | max | ge10 | over10 |
| -------------------------------------------------------- | --: | --: | --: | --: | ---: | -----: |
| cron wrapper `* * * * *`                                 |  20 | 8ms | 8ms | 9ms |    0 |      0 |
| `POST /api/v1/internal/scheduled/check-batch`            | 260 | 4ms | 4ms | 4ms |    0 |      0 |
| `POST /api/v1/internal/continue/sharded-public-snapshot` | 422 | 4ms | 5ms | 6ms |    0 |      0 |
| `POST /api/v1/internal/write/runtime-update-fragments`   |  20 | 1ms | 1ms | 1ms |    0 |      0 |

Không xuất hiện các tín hiệu lỗi / thoái lui sau:

```txt
refresh/homepage: 0
Subrequest depth: 0
canceled: 0
HTTP 500: 0
failed: 0
error_name: 0
timed out: 0
falling back inline: 0
internal sharded homepage runtime seed failed: 0
```

### 2.1 Production post-release Tail

Tệp Tail:

```txt
tmp/perf-10ms/prod-tail-release-issue24-20260429154407.jsonl
```

Tổng thể:

```txt
objects=110
BAD_OR_GE10 count=0
```

| Đường dẫn (Invocation path)                              |   n | p95 | p99 | max | ge10 |
| -------------------------------------------------------- | --: | --: | --: | --: | ---: |
| cron wrapper `* * * * *`                                 |   7 | 6ms | 6ms | 6ms |    0 |
| `POST /api/v1/internal/scheduled/check-batch`            |  21 | 3ms | 3ms | 5ms |    0 |
| `POST /api/v1/internal/continue/sharded-public-snapshot` |  75 | 2ms | 3ms | 4ms |    0 |
| `POST /api/v1/internal/write/runtime-update-fragments`   |   7 | 1ms | 1ms | 1ms |    0 |

---

## 3. Các Flag Phát hành Cuối cùng

> Nhóm flags này đã được bật trong `apps/worker/wrangler.toml` để làm đường cơ sở phát hành cho Free Plan CPU. Nếu điều chỉnh bất kỳ mục nào sau này, bắt buộc phải xác minh lại (Tail) từ đầu.

### 3.1 Tham số lập lịch cơ bản

```toml
UPTIMER_INTERNAL_SCHEDULED_BATCH_SIZE = "2"
```

Kinh nghiệm:

- `2` là batch size cơ bản ổn định nhất đo được trên Dev tính đến hiện tại.
- batch size `1` từng làm tăng chi phí vòng mờ (wrapper overhead).
- batch size `3/4` từng đẩy áp lực CPU lại cho các check-batch con (children).

### 3.2 Các flag cho Released Free Plan CPU profile

```toml
UPTIMER_PUBLIC_MONITOR_UPDATE_FRAGMENT_WRITES = "1"
UPTIMER_SCHEDULED_RUNTIME_FRAGMENT_REFRESH = "1"

UPTIMER_PUBLIC_SHARDED_FRAGMENT_SEED = "1"
UPTIMER_SCHEDULED_SHARDED_FRAGMENT_SEED = "1"
UPTIMER_PUBLIC_SHARDED_ASSEMBLER = "1"
UPTIMER_SCHEDULED_SHARDED_ASSEMBLER = "1"
UPTIMER_PUBLIC_SHARDED_SNAPSHOT_PUBLISH = "1"
UPTIMER_SCHEDULED_SHARDED_PUBLISH = "1"

UPTIMER_PUBLIC_HOMEPAGE_ARTIFACT_FRAGMENT_WRITES = "1"
UPTIMER_SHARDED_ASSEMBLER_MODE = "json"
UPTIMER_SCHEDULED_SHARDED_SKIP_HOMEPAGE_REFRESH = "1"
UPTIMER_SCHEDULED_SHARDED_CONTINUATION = "1"

UPTIMER_SHARDED_FRAGMENT_SEED_BATCH_SIZE = "4"
UPTIMER_SHARDED_RUNTIME_UPDATE_BATCH_SIZE = "5"

UPTIMER_INTERNAL_SCHEDULED_CHECK_BATCH_TIMEOUT_MS = "75000"
UPTIMER_INTERNAL_CHECK_BATCH_FRAGMENT_WRITE_SPLIT = "1"
UPTIMER_INTERNAL_CHECK_BATCH_TRUST_SCHEDULER_LEASE = "1"

UPTIMER_SCHEDULED_REFRESH_LOGS = "0"
```

### 3.3 Các flag đã vô hiệu hóa rõ ràng / không thuộc profile phát hành

```toml
# Bị từ chối vì tạo ra CPU outliers.
UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED = "0"

# Diagnostics (Chẩn đoán) vẫn tắt trong các phép đo phát hành.
UPTIMER_SHARDED_CONTINUATION_DIAGNOSTICS = "0"
UPTIMER_INTERNAL_CHECK_BATCH_DIAGNOSTICS = "0"

# Không dùng trong release profile.
UPTIMER_INTERNAL_SCHEDULED_BATCH_CONCURRENCY = "0"
```

---

## 4. Các Kinh nghiệm Quan trọng

### 4.1 Hướng đi thành công: Tĩnh / Tính toán trước + D1 fragments + Continuation

Phương án cuối cùng giữ lại mô hình tĩnh / tính toán trước cho homepage/status:

- public homepage/status không chạy theo luồng tính toán trực tiếp (live-compute).
- `public_snapshots` lưu giữ ảnh chụp (snapshot) đọc được cuối cùng.
- `public_snapshot_fragments` lưu trữ envelope / monitor fragments / artifact monitor fragments.
- cron chỉ phụ trách điều phối các bước nhỏ.
- Nhiệm vụ lớn được chia thành nhiều lệnh internal continuation.

Hướng đi này giảm thiểu hiệu quả mức đỉnh (peak) CPU cho mỗi lần gọi (invocation).

### 4.2 Raw JSON assembler là bước tối ưu hóa cần thiết

Validated assembler từng đo được mất khoảng `15-16ms`, không thích hợp làm scheduled path cuối cùng.

Cuối cùng sử dụng:

```toml
UPTIMER_SHARDED_ASSEMBLER_MODE = "json"
```

Kinh nghiệm:

- monitor fragments đã được tạo theo schema/serializer trước khi ghi.
- Lắp ráp raw JSON tránh được đỉnh CPU do phải parse/validate/stringify toàn bộ object (toàn phần).
- Trước đây trong các short samples, chế độ raw có mức max khoảng `4ms`.

### 4.3 Trusted scheduler lease là cốt lõi sửa lỗi long tail cho check-batch

Flag then chốt:

```toml
UPTIMER_INTERNAL_CHECK_BATCH_TRUST_SCHEDULER_LEASE = "1"
```

Hiệu quả:

- Failed long Tail trước đó: check-batch max `31ms`.
- Long Tail cuối cùng: check-batch max `4ms`.

Nguyên nhân:

- Các controlled scheduled batches đã được đảm bảo không chồng lấp trong điều kiện bình thường nhờ vào scheduler lease ở mức cao nhất (top-level) + thuật toán phân đoạn duy nhất tất định (deterministic unique chunking).
- Check-batch con (child) nếu lấy thêm batch lock / monitor locks sẽ gia tăng nhiều thao tác D1 và gây ra biến động (jitter) trên CPU/D1.
- Chế độ trusted scheduler lease khi thỏa điều kiện sẽ bỏ qua những khóa thừa (extra locks) này.

Rủi ro:

- Mô hình này phụ thuộc vào scheduler-level lease và unique chunking.
- Không nên bật mặc định.
- Khi release rollout, cần làm rõ rằng nó chỉ được sử dụng cho scheduled service batch path, đồng thời giữ lại phương án dự phòng (fallback/default-off).

### 4.4 Runtime update fragment writes cần chia tách (split) + xử lý khối lượng lớn (bulk)

Profile phát hành cuối cùng bao gồm:

```toml
UPTIMER_INTERNAL_CHECK_BATCH_FRAGMENT_WRITE_SPLIT = "1"
UPTIMER_PUBLIC_MONITOR_UPDATE_FRAGMENT_WRITES = "1"
UPTIMER_SCHEDULED_RUNTIME_FRAGMENT_REFRESH = "1"
UPTIMER_SHARDED_RUNTIME_UPDATE_BATCH_SIZE = "5"
```

Kinh nghiệm:

- Việc mỗi check-batch child trực tiếp ghi runtime update fragments sẽ làm tăng overhead của wrapper/child.
- Việc chuyển sang để scheduler thu gom các bản cập nhật runtime dạng rút gọn (compact) và sau đó bulk gọi một writer duy nhất một lần sẽ ổn định hơn.
- Runtime refresh continuation có tính năng phân trang, giúp tránh xử lý quá nhiều update fragments trong một lần chạy.

Long Tail cuối cùng:

```txt
POST /api/v1/internal/write/runtime-update-fragments:
  n=20
  max=1ms
```

### 4.5 homepage artifact cần pre-render cho các monitor fragments

Profile phát hành cuối cùng bao gồm:

```toml
UPTIMER_PUBLIC_HOMEPAGE_ARTIFACT_FRAGMENT_WRITES = "1"
```

Kinh nghiệm:

- `homepage:artifact` không thể render toàn bộ HTML của monitor card trong cùng một invocation.
- HTML của preload card cho mỗi monitor nên được tạo sẵn (pre-generated) trong giai đoạn fragment seed.
- artifact publish chỉ chịu trách nhiệm ghép (splice) các fragments đã được pre-render.
- Khi các fragments bị thiếu / cũ (stale) / không hợp lệ, hệ thống phải từ chối phát hành artifact hỏng.

Các lớp bảo vệ liên quan:

- Các artifact monitor fragments bị missing/stale/invalid sẽ trả về `missing_artifact_fragments` và bỏ qua (skip).
- Không phát hành các artifact không hoàn chỉnh.

### 4.6 Độ tươi (freshness) của `homepage:artifact` cần dùng `updated_at` để giữ hoạt động (keep-alive)

Iteration 4 phát hiện một lỗi public parity blocker:

```txt
/api/v1/public/homepage-artifact -> 503
```

Nguyên nhân:

- sharded artifact continuation đánh giá artifact row generation đã là bản current (hiện hành).
- Nhưng public artifact reader kiểm tra tính freshness dựa trên `generated_at` ở body.
- generation ở phần artifact body có thể cũ hơn phần status/homepage runtime generation hiện tại, dẫn tới artifact dù tồn tại nhưng bị coi là quá hạn (expired).

Bản sửa lỗi (Fix):

- current artifact continuation sẽ "chạm" (touch) vào `homepage:artifact.updated_at`.
- artifact readers đối với các artifact rows sử dụng `updated_at` để tính freshness.
- body/snapshot vẫn dựa vào `generated_at` đã lưu trữ để thực hiện xác thực tính nhất quán.

Các commits liên quan:

```txt
395fe53 fix(worker): keep current homepage artifact warm
93cfdb1 fix(worker): serve touched homepage artifacts
```

### 4.7 Các scheduled logs bình thường nên có thể tắt đi

Profile phát hành cuối cùng bao gồm:

```toml
UPTIMER_SCHEDULED_REFRESH_LOGS = "0"
```

Kinh nghiệm:

- Các log scheduled summary / continuation thông thường làm tăng mức overhead của hot path.
- Vẫn giữ lại phần warnings/errors.
- Các cờ diagnostics không nên được bật trong quá trình lấy mẫu CPU cuối cùng.

---

## 5. Các Phương án Bị Từ chối

### 5.1 `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED`

Flag này từng được thử nghiệm để cho phép homepage fragments lấy lại dữ liệu mới từ runtime snapshot, nhằm cải thiện độ tươi mới (freshness) cho phần sinh thân artifact / homepage.

Các commits liên quan:

```txt
6afa702 perf(worker): seed homepage fragments from runtime snapshot
2a79fe9 fix(worker): keep runtime homepage seed generation stable
```

Kết quả kiểm tra bị hỏng (failed):

```txt
tmp/perf-10ms/dev-tail-deep-split-iter4-stable-runtime-seed-20260429134817.jsonl
BAD_OR_GE10 count=4
continuation max=15ms
exact 10ms samples=3
```

Kết luận:

```txt
Không đưa UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED vào profile phát hành chính thức.
```

Flag này nên được giữ ở trạng thái default-off. Nó có thể được lưu lại làm thí nghiệm tối ưu trong tương lai, nhưng không thuộc về release profile hiện tại.

### 5.2 Kích thước check batch nhỏ hơn / lớn hơn

Kinh nghiệm:

- batch size `1`: overhead của wrapper trở nên tồi tệ hơn.
- batch size `3/4`: mức sử dụng CPU của check-batch child trở nên tồi tệ hơn.
- Release profile hiện tại giữ nguyên:

```toml
UPTIMER_INTERNAL_SCHEDULED_BATCH_SIZE = "2"
```

### 5.3 Monolithic homepage refresh (Làm mới homepage bằng 1 khối thống nhất)

Phương án này vẫn chưa phù hợp để dùng làm scheduled sharded path:

```txt
POST /api/v1/internal/refresh/homepage
```

Kinh nghiệm:

- Nó quá dễ dàng vượt ngưỡng 10ms CPU.
- Giải pháp cuối cùng sử dụng một cách rõ ràng:
  - sharded fragments
  - raw assembly
  - pre-rendered artifact monitor fragments
  - continuation

---

## 6. Mốc Thời gian Các Bằng chứng Quan trọng

### 6.1 Đường cơ sở (baseline) khi thất bại

```txt
tmp/perf-10ms/dev-tail-artifact-final-soak-20260429105720.jsonl
BAD_OR_GE10 count=4
cron max=12ms
check-batch exact 10ms
```

```txt
tmp/perf-10ms/dev-tail-artifact-final-concurrency1-long-20260429112012.jsonl
BAD_OR_GE10 count=4
check-batch max=31ms
cron max=24ms
continuation max=16ms
```

### 6.2 Trusted scheduler lease short pass (Vượt qua bài test ngắn)

```txt
tmp/perf-10ms/dev-tail-deep-split-iter2-trust-lease-20260429114722.jsonl
BAD_OR_GE10 count=0
cron max=6ms
check-batch max=3ms
continuation max=4ms
writer max=1ms
```

### 6.3 Medium pass (Vượt qua bài test tầm trung)

```txt
tmp/perf-10ms/dev-tail-deep-split-iter3-medium-20260429115803.jsonl
BAD_OR_GE10 count=0
cron max=8ms
check-batch max=4ms
continuation max=5ms
writer max=1ms
```

### 6.4 Iteration 4 rehearsal pass (Vượt qua bài diễn tập)

```txt
tmp/perf-10ms/dev-tail-deep-split-iter4-rehearsal-20260429124702.jsonl
BAD_OR_GE10 count=0
cron max=7ms
check-batch max=4ms
continuation max=6ms
writer max=1ms
```

### 6.5 Cảnh báo về lỗi của runtime homepage seed bị từ chối

```txt
tmp/perf-10ms/dev-tail-deep-split-iter4-stable-runtime-seed-20260429134817.jsonl
BAD_OR_GE10 count=4
continuation max=15ms
```

### 6.6 Final profile rehearsal pass (Vượt qua diễn tập profile cuối cùng)

```txt
tmp/perf-10ms/dev-tail-deep-split-iter4-final-candidate-20260429135630.jsonl
BAD_OR_GE10 count=0
cron max=7ms
check-batch max=4ms
continuation max=4ms
writer max=1ms
```

### 6.7 Final long pass (Vượt qua bài test dài cuối cùng)

```txt
tmp/perf-10ms/dev-tail-deep-split-iter5-final-long-20260429140817.jsonl
BAD_OR_GE10 count=0
cron max=9ms
check-batch max=4ms
continuation max=6ms
writer max=1ms
```

---

## 7. Các bước Verification (Xác minh) Đã vượt qua

Đã vượt qua sau các commits liên quan trong vòng này:

```bash
pnpm --filter @uptimer/worker typecheck
pnpm --filter @uptimer/worker lint
pnpm --filter @uptimer/worker test
pnpm --filter @uptimer/worker test:cron
```

Kết quả của full worker / cron đợt cuối:

```txt
worker test: 47 files / 459 tests passed
test:cron: 42 tests passed
```

Việc xác minh Web UI/UX trước đó:

```bash
pnpm --filter @uptimer/web typecheck
pnpm --filter @uptimer/web lint
pnpm --filter @uptimer/web build
```

Các bản sửa lỗi QC của UI/UX đã hoàn thành, public API / hành vi preload chưa bị hư hỏng bởi hoạt động thay đổi CPU cuối cùng.

---

## 8. Trạng thái Hiện tại của commit / Dev

HEAD tại local / Dev hiện hành:

```txt
2a79fe9 fix(worker): keep runtime homepage seed generation stable
```

Các commits quan trọng:

```txt
99efb7a perf(worker): trust scheduler lease for check batches
395fe53 fix(worker): keep current homepage artifact warm
6afa702 perf(worker): seed homepage fragments from runtime snapshot
93cfdb1 fix(worker): serve touched homepage artifacts
2a79fe9 fix(worker): keep runtime homepage seed generation stable
```

Giải thích:

- `2a79fe9` bao gồm code về runtime homepage seed flag, nhưng flag này có trạng thái default-off.
- Release profile cuối cùng không bật `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED`.
- Dev CI / Deploy chuyển xanh (green).
- Chưa được đẩy lên (push) `origin`.

---

## 9. Các Lưu ý Vận hành Sau Release

### 9.1 Phương thức Phát hành Đã sử dụng

PR #77 sẽ hợp nhất phần mã đã được xác thực (validated code) và bộ tài liệu về trạng thái sẵn sàng phát hành trước; PR #78 sẽ tiếp tục đưa cấu hình Free Plan CPU profile đã được kiểm duyệt thực tế vào `apps/worker/wrangler.toml`, để cho các lần deploy mặc định dùng đúng nhóm flags đã được kiểm tra tính khả thi.

### 9.2 Lần Rollout lên Production / Thay đổi tiếp theo vẫn Bắt buộc Xác minh qua Tail

Sau này, bất kỳ thay đổi nào ảnh hưởng đến release profile flags, scheduled path, hay public snapshot path, đều không thể chỉ dựa vào kết quả trên Dev. Khi kích hoạt hoặc sửa đổi trên Production, bạn cần có ít nhất:

```txt
BAD_OR_GE10 count=0
no exact 10ms
no refresh/homepage fallback
no Subrequest depth
no HTTP 500
public parity OK
```

### 9.3 Cờ (flags) nào có thể cân nhắc Bật mặc định (Default-on) sau này

Các flags đã được tung ra nhưng vẫn cần được theo dõi thận trọng:

- `UPTIMER_SHARDED_ASSEMBLER_MODE=json`
- `UPTIMER_INTERNAL_CHECK_BATCH_FRAGMENT_WRITE_SPLIT=1`
- `UPTIMER_INTERNAL_CHECK_BATCH_TRUST_SCHEDULER_LEASE=1`
- `UPTIMER_PUBLIC_HOMEPAGE_ARTIFACT_FRAGMENT_WRITES=1`

Trong đó rủi ro cao nhất là:

```txt
UPTIMER_INTERNAL_CHECK_BATCH_TRUST_SCHEDULER_LEASE
```

Do nó có thao tác vượt quá child lock, dựa dẫm nhiều vào cơ chế scheduler lease và deterministic chunking.

### 9.4 Cờ (flags) nào PHẢI duy trì Vô hiệu hóa

```txt
UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED
UPTIMER_SHARDED_CONTINUATION_DIAGNOSTICS
UPTIMER_INTERNAL_CHECK_BATCH_DIAGNOSTICS
UPTIMER_INTERNAL_SCHEDULED_BATCH_CONCURRENCY
```

---

## 10. Kết quả của Release checklist

- [x] Kho lưu trữ chính (Main repo) đã thông qua việc hợp nhất PR (#77, #78), không push thẳng vào `master`.
- [x] Dev repo đã được đồng bộ lên mức Main release HEAD.
- [x] D1 migration `0012_public_snapshot_fragments.sql` đã được áp dụng sau khi deploy.
- [x] Production `.toml` đã cấu hình sử dụng các flags được xác minh, không chứa cấu hình chẩn đoán (diagnostics) tạm thời.
- [x] Trong cấu trúc Final release flags không hề chứa `UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED`.
- [x] Đã khởi chạy Production Tail.
- [x] Kết quả lấy từ Tail là `BAD_OR_GE10 count=0`.
- [x] Public route parity đã được xác nhận:
  - [x] `/api/v1/public/homepage`
  - [x] `/api/v1/public/status`
  - [x] `/api/v1/public/homepage-artifact`

---

## 11. Đề xuất Rollback

Nếu rollout trên production gặp vấn đề CPU `>=10ms` hoặc bất cập với public route parity, nên ưu tiên rollback các flags theo các bước sau:

1. Đóng lại các cờ rejected/experimental (đặc biệt lưu ý là chưa kích hoạt phần runtime seed):

```toml
UPTIMER_PUBLIC_SHARDED_HOMEPAGE_RUNTIME_SEED = "0"
```

2. Tắt chế độ trusted scheduler lease:

```toml
UPTIMER_INTERNAL_CHECK_BATCH_TRUST_SCHEDULER_LEASE = "0"
```

3. Tắt phần sharded publish / continuation, quay lại phương án an toàn hơn:

```toml
UPTIMER_SCHEDULED_SHARDED_CONTINUATION = "0"
UPTIMER_SCHEDULED_SHARDED_PUBLISH = "0"
UPTIMER_PUBLIC_SHARDED_SNAPSHOT_PUBLISH = "0"
```

4. Khôi phục thông số baseline cho scheduled batch size:

```toml
UPTIMER_INTERNAL_SCHEDULED_BATCH_SIZE = "2"
```

---

## 12. Lời Kết Cuối (Final statement)

Dựa trên dữ liệu Dev controlled long Tail và production post-release Tail:

```txt
tmp/perf-10ms/dev-tail-deep-split-iter5-final-long-20260429140817.jsonl
BAD_OR_GE10 count=0

tmp/perf-10ms/prod-tail-release-issue24-20260429154407.jsonl
BAD_OR_GE10 count=0
```

Chỉ tiêu của phiên bản phát hành đã đạt giới hạn an toàn dưới mức phạm vi bị lấy mẫu CPU:

```txt
Tất cả các sampled invocation path CPU nghiêm ngặt ở định mức <10ms
```

Issue #24 đã được chốt (final close) vượt qua đợt sát hạch PR #77/#78. Sau này nếu có thay đổi trong CPU profile, scheduled path hay cấu hình public snapshot path, nhất định phải thực hiện quá trình Tail để xác minh và xác thực (re-tail).
