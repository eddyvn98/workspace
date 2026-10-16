# Workspace — Release acceptance, staging, operations và rollback runbook

> Tài liệu hướng dẫn, không phải bằng chứng triển khai đã thực hiện. Tất cả ô [ ] mặc định **chưa xác nhận**.
> Baseline 2026-10-16: main commit `0f07e610867b812188ccf22b06173829301b63a5`.

## 1. Phân loại môi trường và mức chứng cứ

| Level | Mô tả | Chứng minh được | Không được suy diễn |
|---|---|---|---|
| L0 Static | source/docs/package/tree | tồn tại code/config/contract | chạy được, bảo mật |
| L1 Unit | Vitest, pure functions, mocked routes | logic được cover theo input | DB thực, browser thật |
| L2 Browser fixture | /collection-acceptance + localStorage | tương tác component, reload local | session auth, REST Postgres, WS |
| L3 Integration | Postgres/Mongo/WS/Dify trong staging, identity thật | persistence, ACL, multi-client | tải production / recovery thật |
| L4 Release | load, backup/restore, vulnerability checks, canary, observability | có thể vận hành theo phạm vi bật | không bảo đảm không có bug |

**Không dùng L2 thay cho L3.** Đặc biệt, file README Collection ghi rõ fixture Playwright không chứng minh authenticated Postgres hoặc WebSocket.

## 2. Điều kiện trước khi kiểm thử staging

- [ ] Ghi lại SHA của build/branch, release notes, version Prisma migration, lockfile và các flags.
- [ ] Môi trường staging cách ly production, dữ liệu giả (không copy PII), HTTPS ở client/app/WebSocket.
- [ ] PostgreSQL, MongoDB, object storage nếu có, WebSocket service và Dify model-step được cấu hình bằng secrets riêng.
- [ ] Có 2 test identities khác nhau (OWNER/EDITOR và VIEWER) + session độc lập; test unauthorized anonymous.
- [ ] Agent service keys, WS tokens, storage credentials, OAuth tokens không log và không gửi ra client.
- [ ] Kiểm tra health/status của app, DB migrations, realtime WS và scheduler nếu bật.
- [ ] Snapshot/backup staging trước destructive E2E, và restore strategy được xác nhận.

## 3. Các lệnh build và check từ repo

Chạy trên Node.js >=20 và pnpm 9 (pin pnpm 9.10.0 theo packageManager). Chạy các lệnh này trên một checkout sạch với .env staging tương thích:

~~~bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm check:workspace-commands
pnpm test:workspace
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test -c playwright.collection.config.ts
~~~

**Lưu ý:**
- `playwright.collection.config.ts` dùng fixture `/collection-acceptance`; chạy production build trước như tài liệu Collection yêu cầu. Xem config nếu port 3137 xung đột.
- `pnpm check:workspace-parity` và `pnpm check:workspace-agent-source` cần review inputs thực; một số tài liệu lịch sử báo baseline thiếu parity artifacts. Không báo PASS nếu chưa chạy được.
- `pnpm exec knip` là audit, không được tự động gỡ dependency chỉ dựa kết quả đầu tiên.
- Nếu cần Prisma migration cho một feature mới, kiểm tra migration plan và backup trước; `prisma generate` **không phải** thao tác apply migration.
- Không chạy các lệnh mang tính production migration trên DB thật trong quá trình tự động đánh giá PR.

## 4. Ma trận E2E thiết yếu

| ID | Kịch bản | Kết quả cần có | Evidence tối thiểu |
|---|---|---|---|
| E01 | OWNER tạo board, Collection và 2 records; đợi autosave; reload | ID/value/view được giữ, DB revision đúng | API/DB read + recording |
| E02 | Hai field cùng một record sửa nhanh không chờ rerender | Không mất cập nhật trước | DB persisted + reload |
| E03 | Kanban đổi trạng thái bằng kéo thả và select touch, reload | Status khớp, không revert | Video + DB |
| E04 | Focused screen mở trên URL có unrelated query; Back/Forward/copy URL/reload | Screen đúng, không xóa unrelated params | Browser trace |
| E05 | Owner và Editor khác record/field cùng sửa | Hai thay đổi được lưu, không overwrite | Version/revision log |
| E06 | Hai người cùng field, hoặc delete-vs-edit | Chặn ghi đè âm thầm; cảnh báo conflict | Error/receipt trace |
| E07 | Mất mạng khi đang sửa rồi reconnect | Pending/failure hiển thị, có retry/resolution; no silent loss | Browser trace |
| E08 | VIEWER/anonymous gọi direct API mutation, AI actions, file deletes | 401/403 và DB không thay đổi | Requests + DB check |
| E09 | Table/Sheet nhiều sheets, formula, format import/edit/export | Supported round-trip đạt hợp đồng | Golden XLSX diff |
| E10 | Tiptap heading/list/table/image/paste/undo và AI sửa đoạn | Content/selection ổn, save/reload đúng | HTML compare + video |
| E11 | Mind Map reparent, cycles, timeline dependencies, 200+ records | Không tạo cycle; giới hạn được thể hiện | Snapshot + model diff |
| E12 | Slide export PPTX + PDF | File mở được; fidelity test, text layer theo contract | PPTX inspection/PDF extract |
| E13 | AI tạo/edit Collection sau prompt, rồi reload | Persisted receipt và DB match; không bịa status | Dify ID + server receipt |
| E14 | AI tool bị từ chối, cancel, timeout hoặc repeat | Không mutation trái phép/trùng; phản hồi đúng | Log sanitized + DB |
| E15 | Realtime 2 clients (board thường) và Collection theo mode hiện hành | Behavior tương ứng contract; no silent overwrite | WS trace + DB |
| E16 | Backup/restore board, files, chat/reference và versions | Restore xác minh hash/count/reference integrity | Restore report |
| E17 | Scheduler time-zone, tick kép, conflict, missed run | Tối đa 1 completed rule/local day; backlog không tự bù | Job run receipts |
| E18 | External tool OAuth (chỉ khi feature enabled) | Consent, read, revoke, cross-user isolation | Test tokens redacted |

## 5. Cấp độ test cho mỗi PR

**Quick check:** tsc + affected Vitest + capability registry + build.  
**Merge gate:** full Workspace Vitest + Playwright fixture + static checks; không chỉ một nhóm collection test.  
**Staging gate:** kịch bản thật E01–E08, E13–E15 cho thay đổi dữ liệu/cộng tác/AI.  
**Release gate:** E01–E18 theo feature enabled, backup/restore, security scan, perf và rollout/rollback proof.

Test thất bại do baseline không được blanket-ignore. Lập issue theo test name, chỉ chấp nhận temporary exception có expiry/owner và không áp dụng cho security/data loss.

## 6. Hiệu năng và tải

Tạo bộ dữ liệu sạch: 200, 1.000, 5.000 records Collection; 200, 1.000, 5.000 canvas blocks (không giả định tất cả case đều cần render 5k cùng lúc); 2, 5, 10 concurrent browser editors; tài liệu 1 MB/10 MB và slide deck 10/50 slides tùy production requirements.

**Thu số liệu:** interaction latency p50/p95, render commit time, JS heap, bundle split, API response, save latency p95, WS reconnect duration, mutation conflicts/1000 writes, Dify response/execute time, browser errors. Thiết lập budget sau lần benchmark baseline có ghi model máy/browser; không đặt ngưỡng bịa.

**Stop/rollback:** có data corruption/silent overwrite, unauthorized write, lost revisions, recurrent migration deadlock, record count/hash mismatch hoặc spikes nghiêm trọng ngoài ngưỡng đã duyệt.

## 7. Phục hồi và rollback

1. **Trước release:** tạo backup/snapshot Postgres, Mongo, file storage và configuration version; ghi lại commit, container/process version và migrations.
2. **Bật dần:** staging → canary user/board → cohort mở rộng; new storage protocol và external connector luôn feature flag off mặc định.
3. **Quan sát:** log structured theo requestId, boardId (mask), revision, turnId/receipt, job IDs, Dify timeouts; ghi alarm trên save failures, CAS-conflict storms, scheduler stall, WS errors.
4. **Khi sự cố:** ngừng writes liên quan bằng flag/read-only safe mode, lưu dấu evidence, rollback app bằng SHA trước. Nếu migration data đã xảy ra, **không** chỉ revert code; chạy rollback script hoặc restore tương thích đã thử trước.
5. **Khôi phục:** verify số board/record IDs, revision monotonicity, artifact checksums, permissions/share ACL, stored chat/usage references; mở dần writers khi đồng bộ.
6. **Sau sự cố:** incident report với timeline, phạm vi ảnh hưởng, test thiếu, PR remediation và cách ngăn tái diễn.

**DB migration golden rule:** migration phải thiết kế forward/backward compatible hoặc có phục hồi theo phiên bản. Không xóa cột/field cũ trong cùng release với lần chuyển dữ liệu đầu tiên.

## 8. Bảo mật và kiểm soát app ngoài

- Dify/AI không có quyền tự gọi SQL hoặc tool arbitrary để ghi board; backend validate command, actor, board scope, edit permissions, expected revision.
- Realtime handshake/token được ký, giới hạn room, revoke khi user mất quyền.
- Public share links có expiry/revoke/rate limit; không lộ document/asset không thuộc board.
- File import chỉ xử lý MIME/extension hợp lệ, giới hạn kích thước, quota/pixel count; chặn SSRF tại URL preview/remote fetch.
- MCP/OAuth: state/nonce/PKCE ở nơi cần, server-only token vault, encryption, secret rotation, revoke, allowlist tool, user confirmation cho external writes.
- Webhooks/notifications cần durable outbox, signature, delivery receipts, retry/backoff, DLQ; không kích hoạt khi chưa kiểm soát quyền và opt-in.

## 9. Release sign-off mẫu

~~~text
Release ID:
Date/time UTC / timezone:
Head SHA:
Feature flags on/off:
Linked PRs/issues:
CI URL and result:
Staging URL (private):
E2E evidence: E01..E18 with PASS/FAIL/N/A reason
DB snapshot/restore test:
Security scan and waived findings:
Baseline vs current performance:
Current P0/P1:
Rollout owner:
Rollback tested (SHA, flags, migrations, evidence):
Final decision: GO / NO-GO
~~~

GO chỉ khi không còn P0, P1 thuộc bảo mật/data loss, tính năng bật đều vượt qua gate, và backup+rollback được thử. Nếu một feature chưa sẵn sàng thì tắt rõ ràng, không giả rằng hoàn thiện toàn dự án.

## 10. Đối chiếu tài liệu gốc

- [Collection contract](../../app/workspace/collections/README.md): REST-only Collection và giới hạn fixture/real staging.
- [Collection scheduler](../workspace-collection-scheduler.md): cần cron bên ngoài, không có email/Telegram/webhook.
- [Master plan](./00-master-plan.md), [Backlog](./02-implementation-backlog.md): nguồn lập kế hoạch. Không phải nhật ký vận hành.

**Trạng thái hiện tại của tài liệu:** authored, **tests/deploy/restore chưa được chạy trong yêu cầu viết tài liệu này**.
