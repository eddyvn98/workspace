# Backlog triển khai Workspace — có thể giao cho coding agent

Baseline 2026-10-16: main `0f07e61`. Mọi mục dưới đây **PLANNED** trừ khi có PR + SHA + CI + staging evidence. Mỗi PR có phạm vi nhỏ, không trộn refactor với migration; cập nhật checklist sau khi thực thi. Theo [master plan](./00-master-plan.md) và [library matrix](./01-library-capability-matrix.md).

## Quy tắc cho AI coding agent

1. Kiểm tra HEAD, open PR, workflow, existing tests trước khi sửa. Không ghi đè nhánh/PR chưa review; PR #38 là blocker liên quan.
2. Mỗi lần chỉ chọn **một** ID dưới đây, tạo branch và mô tả đầy đủ: baseline, thay đổi, migration, rủi ro, test, kết quả và rollback. Không tuyên bố đạt khi chưa chạy.
3. Khóa phạm vi theo file; code mới ưu tiên dưới 300 dòng/file; ít dependency; tôn trọng Next 14, React 18, pnpm 9 và mô hình Postgres + Mongo + Dify hiện hành.
4. UI và AI phải dùng chung validation/ACL/persistence; mọi mutation trả receipts; rejected/partial không được diễn đạt như thành công.
5. Không “fix” CI bằng xóa tests, skip diện rộng hoặc hardcode staging credentials.
6. Mỗi PR cập nhật trạng thái: `PLANNED | IMPLEMENTING | CI_PASS | STAGING_PASS | RELEASED | BLOCKED`, và link xác minh.
7. Không bật migration dữ liệu hoặc external connector feature trên production cho đến khi có acceptance và rollback.

## P0 — Correctness và release foundation (bắt buộc hoàn thành trước các thay đổi cấu trúc)

### WS-001: đóng PR #38 đúng cách
- **Dependencies:** none. **Mã:** PR #38, CollectionSurface, CollectionBlock, route resolver, collection form/kanban.
- [ ] Review diff, quy trình stale-state và giữ `collectionScreen` / unrelated URL params.
- [ ] Rapid edits 2 fields cùng record + status Kanban, Save, reload; Back/Forward/reload focused view, copy URL sang browser khác.
- [ ] Test owner/editor và viewer, click/edit/move trên desktop và mobile.
- [ ] Merge hoặc sửa lại dựa trên kết quả; không đóng #35/#36 trước bằng chứng thật.
- **Acceptance:** không silent lost update, URL focus được giữ, production build và browser E2E pass.
- **Evidence:** PR URL, commit SHA, Playwright recording/CI link, staging URL và sanitized log.

### WS-002: universal CI required checks
- **Dependencies:** WS-001 có thể chạy song song. **Mã:** .github/workflows/, scripts/, package.json.
- [ ] Workflow chung `pull_request` tới main và `push` main, chạy `pnpm install --frozen-lockfile`, `pnpm prisma:generate`, `pnpm exec tsc --noEmit`, `pnpm test:workspace`, `pnpm build`.
- [ ] Chạy `pnpm check:workspace-commands`; agent source/parity checks: nếu baseline thiếu artifact, phân loại blocker/baseline debt có issue, không suppress vô điều kiện.
- [ ] Chạy browser fixture bằng production build; ghi tách test thật dùng Postgres/Mongo/WS.
- [ ] Branch protection: required checks và không bypass nếu settings cho phép.
- **Acceptance:** intentional failing test giữ PR đỏ; rerun sạch reproducible; không dừng ở CI chỉ riêng Collection.

### WS-003: lưu, autosave, xung đột và mất mạng
- **Dependencies:** WS-001, WS-002. **Mã:** useWorkspacePersistence*, mergeBoardConflict, boardCommit, sync-board.
- [ ] Test hai phiên đổi khác record/field, cùng field, delete-vs-edit, add field/view, merge audit event.
- [ ] Tắt mạng khi pending save → UI pending; reconnect → retry có idempotency; stale version không ghi đè server.
- [ ] Prevent unload/explicit retry khi failed; restore dữ liệu từ snapshot trước, kiểm chứng DB revision.
- **Acceptance:** zero silent overwrite trong test matrix; mỗi conflict hiển thị lựa chọn hoặc lý do không merge.

### WS-004: authorization / input security baseline
- **Dependencies:** WS-002. **Mã:** app/api/workspaces, agent auth, resource endpoints, public link.
- [ ] Access matrix owner/editor/viewer/public/no-access cho mutation, export, AI, file, comments, version restore, WS access.
- [ ] Kiểm thử đường обход thông qua direct POST và forged actor/model actions.
- [ ] Input fuzz/size limits cho JSON/CSV/HTML/file, SSRF URL preview và AI references; verify deny on server.
- **Acceptance:** không có unauthorized persistent write hoặc leak cross-board.

## P1 — Đồng bộ và editor fidelity

### WS-101: ADR cho Collection realtime
- **Dependencies:** WS-003. **Mã:** ydoc-shapes, useWorkspaceRealtime, Collection model, boardCommit.
- [ ] Đo REST CAS + revision notification (A) so với granular Yjs (B) bằng PoC hai user.
- [ ] Chọn phương án bằng dữ liệu latency, conflict, migration/rollback cost, feature flags.
- [ ] Viết schema version/compatibility/writer ownership ADR và test plan, không merge trực tiếp prototype.
- **Acceptance:** decision rõ, có measured benchmark + security/rollback review.

### WS-102: triển khai realtime strategy đã chọn
- **Dependencies:** WS-101, WS-004.
- [ ] Nếu chọn A: cải thiện refresh/presence, stale edit UX, diff/conflict, giữ CAS.
- [ ] Nếu chọn B: nested CRDT records/fields/order; fencing REST/WS; auth + snapshots + migration; shadow compare và flag.
- [ ] Chaos test disconnect/reconnect, simultaneous edits, stale client, server restart, deletion, restore.
- **Acceptance:** hai phiên thật chỉnh sửa không mất dữ liệu, write semantics documented, rollback verified.

### WS-103: Doc/Tiptap parity và editor regression
- **Dependencies:** WS-002, WS-003.
- [ ] Fixtures paragraph, headings, lists/tasks, links, image, tables, paste/undo, AI-selected text.
- [ ] Validate HTML sanitization, selection/caret stability sau saves/revisions.
- [ ] Browser tests keyboard, clipboard, mobile, read-only.
- **Acceptance:** save/reload/paste/undo không mất structure, accessibility gate passed.

### WS-104: Spreadsheet/FortuneSheet round-trip
- **Dependencies:** WS-002, WS-003.
- [ ] Golden XLSX with sheets, formulas, merged, number/date, styles, validation/freeze; xác định contract supported/unsupported.
- [ ] Test import→edit→export→reimport; formula recalculation và offset references.
- [ ] AI schema parity sheet create/move/rename/format; update persistence và role deny.
- **Acceptance:** supported fixtures đạt expected cells/formulas/styles; mất fidelity phải được cảnh báo.

### WS-105: Slide/PDF/Office export fidelity
- **Dependencies:** WS-002.
- [ ] PPTX objects editable, fonts/layout/assets/charts; compare golden rendering.
- [ ] PDF raster pipeline hiện hữu được ghi rõ; nếu text selectable là requirement, thêm vector text exporter + extraction test.
- [ ] Limit file sizes/runtime; failure không trả success hoặc corrupt artifact.
- **Acceptance:** file opens in target office apps; text selectable nếu công bố supported; asset/chart layout trùng golden trong tolerance.

### WS-106: Canvas interaction/performance
- **Dependencies:** WS-002.
- [ ] Stress canvas 200/1k/5k blocks/edges với pan/zoom/selection/drag, touch and keyboard.
- [ ] Fix hit testing/connector routing/undo/redo/history and UI stale interaction theo profiler.
- [ ] Performance budget được quyết định sau baseline, không đặt FPS/latency theo cảm tính.
- **Acceptance:** no data loss, no stuck interaction; perf regression dưới ngưỡng được chốt qua benchmark.

### WS-107: Collection large data / views
- **Dependencies:** WS-003, WS-002.
- [ ] Table paging/filter/sort/search 200/1k/5k; benchmark DOM + memory; chỉ thêm @tanstack/react-virtual nếu chứng minh hiệu quả.
- [ ] Kanban DnD touch/keyboard, Calendar timezone, Gallery render bounds, Form required/relation, Timeline dependencies.
- [ ] Mind Map: xử lý giới hạn 200 bằng subgraph/lazy hierarchy hoặc restriction rõ; không silent truncation.
- **Acceptance:** id & field values giữ nguyên qua mọi view; không drift khi chuyển tab/undo/reload.

## P1 — AI chất lượng và đúng quyền

### WS-201: Agent command parity 123 commands
- **Dependencies:** WS-002, WS-003, WS-004.
- [ ] Generate audit matrix từ config/workspace-command-registry.json (123 entries tại baseline).
- [ ] Mapping entry → schema → executor → receipt → UI parity → tests; không đánh dấu green theo name-only.
- [ ] Các đường create/update/delete, collections, slides, table, docs, files, comments, share/version, export được test với actor roles.
- **Acceptance:** các actions được gắn Supported có golden E2E xác minh DB; unsupported rõ lý do.

### WS-202: AI runtime hardening và model-provider reliability
- **Dependencies:** WS-201.
- [ ] Streaming + cancellation, duplicate request guard, retry/backoff, partial success, bounded context và model error handling.
- [ ] Không để provider output bypass Zod/ACL/commit; answer summary lấy từ receipts.
- [ ] Kiểm tra Dify usage ID/log và PII redaction không lưu token.
- **Acceptance:** AI không tuyên bố mutation thành công khi không persisted; timeout/failure recoverable.

### WS-203: Knowledge retrieval grounded quality
- **Dependencies:** WS-002, WS-004.
- [ ] Benchmark tiếng Việt/Anh, search lexical/vector/fallback với tài liệu có trusted source IDs.
- [ ] Source filename, permissions per board, stale chunks/deletions, cache model footprint.
- [ ] Retrieval không có evidence -> AI trả không có dữ liệu và không bịa citations.
- **Acceptance:** benchmark accuracy + source recall và access check được báo cáo.

## P2 — Automation / kết nối ngoài / bảo trì

### WS-301: scheduler production runbook
- **Dependencies:** WS-002, WS-004.
- [ ] Cron thực (host OS, external provider); env secret an toàn, periodic interval, status/alert.
- [ ] Test missed day, timezone, duplicate ticks, CAS conflict, no-run when disabled, multiboard pagination.
- [ ] Ops dashboard/metric, emergency-disable, run receipts và restore.
- **Acceptance:** scheduled updates thực sự chạy theo local time, không double-run.

### WS-302: durable outbox cho external actions
- **Dependencies:** WS-301, WS-004.
- [ ] Durable queue/outbox, idempotency key, retries, backoff, DLQ, rate limit, signing, redaction.
- [ ] Không gọi external side effect trực tiếp trong transaction; user opt-in per action và preview/test send.
- **Acceptance:** một logical event không gửi trùng ngoài mức contract; failure quan sát/retry được.

### WS-303: MCP OAuth connector hub
- **Dependencies:** WS-201, WS-302, WS-004.
- [ ] Per-user app connection (OAuth auth-code + PKCE nếu phù hợp), state/nonce, encrypted server tokens, refresh, revoke, tenant isolation.
- [ ] MCP registry/capabilities với tool allowlist, prompt injection defenses, audit, disconnect/expire.
- [ ] Thử 1 app read-only end-to-end trước tool writes; write external có user confirmation + receipts.
- **Acceptance:** Login→Consent→Read→Disconnect→Revoke, không cross-user access.

### WS-304: dependency/performance debt
- **Dependencies:** WS-002, WS-103/104/105 theo stack được đụng.
- [ ] Chạy knip, import graph, bundle analyzer; kiểm chứng dynamic import trước khi gỡ.
- [ ] Quyết định có cần 3 chart engines, 2 transformers packages, virtual/MCP dependency chưa tích hợp.
- [ ] Tránh runtime "latest", pin/upgrade trong PR riêng; refactor file lớn theo trách nhiệm + tests.
- **Acceptance:** smaller/equal bundle hoặc complexity giảm có số liệu; no regression.

### WS-305: observability, backup/restore, release
- **Dependencies:** tất cả module cần public.
- [ ] Tracing/logs structured (redacted) cho boardId, turnId, command receipt, WS, scheduler.
- [ ] Backup và restore test Postgres, Mongo, artifacts trên staging.
- [ ] Secret rotation, vulnerability scan, audit access; metrics/alerts, rollback, canary flags.
- **Acceptance:** runbook [03](./03-release-acceptance.md) ký nhận, smoke và rollback pass.

## Bảng ưu tiên + phân chia nhánh

| Sprint/đợt | Chọn IDs | Exit gate |
|---|---|---|
| 0 — Protect data | WS-001, 002, 003, 004 | CI + real save/auth tests xanh |
| 1 — Core fidelity | WS-103, 104, 105, 106, 107; WS-101 PoC | Golden fixtures, perf baseline, ADR |
| 2 — Collaboration | WS-102 | Two-user live E2E + rollback |
| 3 — AI reliability | WS-201, 202, 203 | Command receipt + permissions + knowledge |
| 4 — Extend | WS-301, 302, 303, 304 | Cron/connector explicit consent, no regression |
| 5 — Launch | WS-305 | Security + restore + monitoring + signed release |

**Parallelism rule:** Mỗi coding agent có nhánh riêng. Không chạy song song hai agent cùng sửa useWorkspaceStore, boardCommit hoặc agent action registry. Integration owner quản lý merge order và chạy full suite sau mỗi merge.

## PR template tối thiểu

~~~markdown
## Work item / scope
WS-xxx; files and contract; what remains out of scope

## Evidence
- Base/main SHA:
- Modified files:
- Unit/integration/Playwright commands and results:
- Authenticated staging browser + DB persistence proof:
- Performance before/after (if applicable):
- Security / rollback:
- CI run link:
- Known failures with issue reference:

## Release decision
[ ] CI_PASS   [ ] STAGING_PASS   [ ] REVIEWED   [ ] RELEASED
~~~

Tránh tự kết luận “done”: cho đến khi có evidence đủ, giữ PLANNED hoặc BLOCKED.
