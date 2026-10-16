# Workspace — Kế hoạch triển khai hoàn thiện toàn diện

> **Loại:** Technical implementation plan (không phải báo cáo đã hoàn thành)  
> **Cập nhật:** 2026-10-16  
> **Baseline:** nhánh main tại 0f07e610867b812188ccf22b06173829301b63a5  
> **Phạm vi:** ứng dụng Workspace trong eddyvn98/workspace; ưu tiên dữ liệu đúng, AI có kiểm chứng và release có thể vận hành  
> **Trạng thái:** PLANNED; từng hạng mục chỉ DONE khi có bằng chứng theo [Release runbook](./03-release-acceptance.md)

## 0. Đọc trước khi triển khai

- [Ma trận thư viện và kiến trúc](./01-library-capability-matrix.md)
- [Backlog thực thi theo thứ tự phụ thuộc](./02-implementation-backlog.md)
- [Runbook kiểm thử, triển khai và rollback](./03-release-acceptance.md)
- [Contract Collection đã triển khai](../../app/workspace/collections/README.md)
- [Scheduler Collection hiện có](../workspace-collection-scheduler.md)
- [AI Collection handoff (có đoạn là snapshot lịch sử)](../ai-collection-command-gap.md)

**Quy tắc bằng chứng:** có dependency không đồng nghĩa có tích hợp; có mã nguồn không đồng nghĩa test pass; test fixture không đồng nghĩa persistence thật; CI xanh trên PR không đồng nghĩa staging đạt; số phần trăm hoặc điểm đánh giá chỉ là ước lượng, không phải KPI nghiệm thu.

## 1. Mục tiêu sản phẩm và điều kiện kết thúc

Workspace là một không gian làm việc canvas với Doc, Table/Spreadsheet, Slide, Mind Map/Diagram, Shape, File, Image/Image Flow và Collection nhiều dạng xem. Người dùng có thể chỉnh sửa thủ công hoặc ra lệnh AI trên cùng dữ liệu. **Không xây lại sản phẩm từ đầu.**

**Definition of Done toàn dự án:**

1. Chỉnh sửa nhanh, đa tab, offline/reconnect và xung đột không được âm thầm mất dữ liệu; bảo vệ thao tác xóa và quyền truy cập ở server.
2. Mọi dạng block chính có vòng đời create → edit → save → reload → export/import (nếu hỗ trợ) → share/viewer; lỗi và các tính năng không hỗ trợ phải rõ ràng.
3. AI chỉ thực thi action đã đăng ký, validate và authorize tại Workspace; báo cáo kết quả dựa trên receipt đã persist, không dựa vào câu trả lời của model.
4. CI bắt buộc cho PR tới main và đường triển khai; staging có DB và WebSocket thật; ít nhất một bộ E2E đăng nhập nhiều phiên thật.
5. Có backup, phục hồi thử nghiệm, audit có giới hạn rõ, cảnh báo lỗi, checklist release/rollback; bảo mật secret và tách dev/prod.
6. Những thư viện thừa được kiểm tra bằng bằng chứng và gỡ có regression test; không áp KPI “100% chức năng thư viện”.

## 2. Hiện trạng được xác nhận tại baseline

| Mảng | Đã có trong repo | Giới hạn cần xử lý |
|---|---|---|
| Giao diện/canvas | Blocks, connectors, layouts, history, selection, presentation, chia sẻ | Cần kiểm chứng toàn bộ tổ hợp thao tác và thiết bị; tránh regresion |
| Collection | Table, Kanban, Calendar, Timeline/Gantt, Gallery, Mind Map, Form; field, relation, lookup/rollup, formula, automation, lịch chạy, audit giới hạn | Chưa đồng bộ record-level realtime; xử lý sửa nhanh và URL đang ở PR #38; giới hạn render Mind Map 200 record |
| Doc/Spreadsheet/Slide | Tiptap, FortuneSheet, slide actions, PPTX/PDF export | Cần fidelity round-trip và stress test; PDF slide hiện raster hóa |
| AI | Dify model provider, typed action registry, validation, execution và receipt; 123 command entries ở baseline | Registry entry không tự bảo đảm lệnh chạy được end-to-end; thiếu ma trận golden test trên staging cho mọi capability |
| Lưu trữ và realtime | PostgreSQL + Prisma (board/quyền), MongoDB (state/log), Yjs/y-websocket cho board thường | Collection dùng REST CAS + merge theo field; không được kích hoạt đồng thời hai writer cho cùng board |
| CI/test | Vitest, Playwright fixture, hai GitHub Actions workflow theo Collection | Không chứng minh full E2E với auth/Postgres/Mongo/WS; chưa có universal required checks toàn repo |
| Automation | Node endpoint xác thực, batch cursor, lịch theo local day, chống double-apply bằng CAS | Phải có cron thật, chưa có webhook/email/Telegram/outbox |
| Kết nối ngoài | MCP SDK xuất hiện trong dependencies | Chưa xác minh OAuth connector hub hoặc các app có thể đăng nhập bằng giao diện rồi AI dùng |

**Đang mở:** [PR #38](https://github.com/eddyvn98/workspace/pull/38) sửa cập nhật record liên tiếp và giữ tham số collectionScreen trên URL; lúc lập kế hoạch là **draft, chưa merge**. Không gắn nhãn DONE chỉ vì hai workflow CI đã có lần chạy thành công.

## 3. Nguyên tắc kiến trúc bất biến

- **Workspace sở hữu dữ liệu và quyền.** PostgreSQL/board revision/receipts là sự thật đối với mutation. Browser cache và Dify chỉ là projection/agent provider.
- **Dify chỉ cung cấp model và log model.** Không chuyển mutation sang prompt, Dify workflow, plugin tự viết trực tiếp database, hoặc yêu cầu người dùng phải có khóa provider riêng.
- **Một đường execution cho UI và AI.** Phần validate action, capability, quyền, commit và conflict phải dùng chung; nếu UI và AI có API khác, bắt buộc có test parity.
- **Một writer có thẩm quyền ở mỗi thời điểm.** Yjs và REST phải có handshake/bảo vệ rõ; chuyển chế độ realtime cần protocol migration, không chỉ bỏ lệnh if(hasCollection).
- **Không giả lập thành công.** AI phản hồi chỉ được khẳng định cập nhật khi receipt persisted; phía UI phân biệt pending/saved/conflicted/failed.
- **Feature flag trước khi thay hạ tầng lưu dữ liệu.** Có kế hoạch dual-read, shadow verification, migration tiến/lùi và rollback.
- **Ít dependency, dễ bảo trì.** Ưu tiên module nhỏ dưới 300 dòng/file cho phần mới hoặc file đang sửa, không “chia file” vô nghĩa để đạt chỉ số.

## 4. Sơ đồ logic mục tiêu

~~~text
Browser UI (Canvas / Collection / Doc / Sheet / Slide / Agent chat)
  | authenticated API + read/write ACL
  v
Workspace Server (Next.js API, command executor, schemas, receipts)
  |-- PostgreSQL/Prisma: board versions, access, resources metadata
  |-- MongoDB: chat/usage/event state theo contract đang có
  |-- File storage: database hoặc object storage theo cấu hình
  |-- WebSocket/Yjs: realtime cho nhóm dữ liệu được bật theo capability
  |-- Knowledge: chunking, lexical/vector retrieval, citations
  |-- Dify model-step: đề xuất typed actions, KHÔNG commit DB trực tiếp
  |-- Scheduler: cron ingress -> guarded CAS write
  '-- (planned) Connector Hub: per-user OAuth + MCP tool adapters
         -> tool permission + confirmation + durable operation receipt
~~~

**Lưu ý:** sơ đồ là mục tiêu tích hợp, không tuyên bố Connector Hub hoặc Yjs granular đã tồn tại.

## 5. Workstreams theo thứ tự

### W0 — Chốt baseline và sửa lỗi có nguy cơ mất dữ liệu (P0)

**Code entry:** app/workspace/renderers/CollectionSurface.tsx, app/workspace/collections/model.ts, app/workspace/hooks/useWorkspacePersistenceSave.ts, app/workspace/utils/mergeBoardConflict.ts, app/api/workspaces/[id]/sync-board/route.ts.

- Kiểm tra PR #38 bằng Playwright + board thật: thay hai field cùng record liên tiếp; đổi status Kanban, nhập nhanh, autosave, reload, Back/Forward, URL có query param khác.
- Unit test stale closure/revision, conflict hai phiên: khác field, cùng field, delete-vs-edit, network interrupt, recovery và audit history ID.
- Triển khai “server receipt / client save status” nhất quán; lỗi không tự reset nội dung đang sửa.
- Merge chỉ khi staging đạt. Không thay đổi định dạng persisted data để sửa UI bug.

**Gate W0:** 0 lần mất dữ liệu/ghi đè âm thầm trong test matrix; PR #38 merged hoặc được thay thế bằng fix có chứng cứ, không có regression blocker.

### W1 — Quality foundation và release gates (P0)

**Code entry:** .github/workflows/, __tests__/workspace/, __tests__/browser/, vitest.config.ts, playwright.collection.config.ts, scripts/.

- Thêm workflow CI chung cho mọi PR hướng tới main: install frozen lock, Prisma generate, static check, TS check, command-registry test, Vitest Workspace, production build, browser fixture. Chạy check chỉ dùng fake/isolated credentials; không leak secrets.
- Tách rõ nhóm fast/unit, integration có Postgres/Mongo/WebSocket thật, browser fixture và full E2E authenticated. Nếu baseline đỏ, mở issue bằng tên test, không blanket-ignore.
- Thêm test contracts cho saved Board/Doc/Sheet/Slide/AI/permissions cùng các thay đổi liên quan, không chỉ Collection.
- Bật branch protection/required status checks khi quyền GitHub cho phép; nếu không, liệt kê thiết lập thủ công.
- Ghi nhận CI runtime, flake rate, bundle sizes, Sentry/telemetry nếu được chủ repo chọn.

**Gate W1:** PR không thể merge khi required checks đỏ; pipeline reproducible trên một máy sạch; test staging phân biệt với fixture.

### W2 — Persistence, realtime và cộng tác thống nhất (P1, HIGH RISK)

**Code entry:** lib/workspace/ydoc-shapes.ts, lib/workspace/ydoc.ts, lib/workspace/ydoc-persistence.ts, app/workspace/hooks/useWorkspaceRealtime.ts, app/workspace/collections/model.ts, lib/workspace/boardCommit.ts.

- Trước tiên viết ADR và PoC trên nhánh riêng: chọn (A) REST CAS + thông báo realtime/refresh theo revision hoặc (B) CRDT granular Collection. Không mặc định B tốt hơn cho mọi thao tác.
- Nếu chọn B: Collection fields, records, view metadata và audit entries cần biểu diễn theo stable IDs và granular transaction; chiến lược cho schema delete, relation, formula, history. Không nhét toàn bộ JSON Collection vào một Y.Map value.
- Thiết kế server authority, write fencing, versioned migration, rollback và compatibility với socket/client cũ. Tránh two-writer/Yjs-REST loop, replay sau reconnect và phantom saves.
- Kiểm chứng cùng field (conflict policy công khai), khác field (merge), delete-vs-update, create đồng thời, offline rejoin, quyền viewer, khôi phục snapshot.
- Chỉ sau khi shadow validation pass mới bật feature flag theo cohort; duy trì REST fallback trong giai đoạn chuyển đổi.

**Gate W2:** ít nhất 2 browser identity thật cùng board, không silent overwrite; restore/history và offline reconnect ổn; có rollback được chứng minh.

### W3 — Hoàn thiện editor, performance và xuất/nhập (P1)

- **Doc:** Tiptap rich content, image/table/selection, undo, cursor stability, AI sửa đoạn, sanitize HTML, round-trip lưu/reload; editor state không nhảy khi remote update.
- **Spreadsheet:** FortuneSheet import/export (ExcelJS/xlsx nếu phù hợp) bảo toàn sheets, formula, style, merged cells, frozen rows, date/number format; test case unsupported phải thông báo trước.
- **Slides:** kiểm tra editable PPTX export, chart/data, images, layout, text overflow, font fallback; PDF đang chuyển SVG -> JPEG -> PDF, hãy chọn vector text export nếu cần search/select text thay vì tự nhận tương đương PDF native.
- **Collection:** bảng trang 25–250 dòng hiện hợp lý; benchmark trước khi dùng TanStack Virtual. Với 200/1.000/5.000 records đo search, sort, re-render, edit, network save; Mind Map 200 record là giới hạn hiện hữu cần hiển thị rõ.
- **Canvas:** stress test số blocks/connectors lớn, snapping, pan/zoom, keyboard, drag/drop touch, PDF/file preview, share viewer, resize, saved camera.
- **Image/video flow:** bảo vệ dữ liệu upload/preview, quota, cancel, retry, versioning và xác thực; đừng mở rộng model providers chỉ để “dùng thư viện”.

**Gate W3:** golden fixture round-trip, visual snapshot phù hợp, không treo UI hoặc lỗi export âm thầm trong bộ dữ liệu được hỗ trợ.

### W4 — AI agent đáng tin cậy và knowledge (P1)

**Code entry:** config/workspace-command-registry.json, lib/workspace-agent/, app/api/workspaces/[id]/agent/, lib/workspace/knowledge-search.ts, lib/embeddings.ts.

- Tạo ma trận đủ **123 command entries** theo các cột: schema, quyền, reads/writes, idempotency, conflict, UI parity, real-staging test, receipt. Đếm lại khi registry đổi.
- Chạy một runtime executor chung: model proposes -> schema validation -> auth -> revision check -> commit -> receipt -> response. Không tin kết quả prompt nếu DB không persist.
- Verify cancellation, replay guard, retries, rate limit, partial failure, stream progress, bounded context, Dify model usage logs (tránh lưu sensitive fields).
- Knowledge: kiểm chứng full-text + vector + fallback, source filename attribution, quyền truy cập theo board, hallucination/no-evidence answers, large document performance.
- E2E từ câu tự nhiên đến persisted board, lệnh không được hỗ trợ, viewer denial, nhiều actions liên tiếp, Dify timeout/failure, retry sau mạng chập chờn.
- Chỉ cải thiện harness/subagent sau khi tool contracts ổn định; subagent không được tự tạo đường mutation thứ hai.

**Gate W4:** mọi lệnh được đánh dấu Supported phải có schema và golden tests; mọi lệnh failed/partial phải hiện đúng; không có action thành công giả.

### W5 — Automation, MCP và App Connector Hub (P2; chỉ mở sau W0–W4)

- **Scheduler:** vận hành scripts/collection-schedule-cron.mjs bằng cron hoặc Windows Task Scheduler 10–15 phút; xác thực secret ít nhất 32 ký tự, metrics tick/lag/conflict và job ownership; backup trạng thái lastRunDay.
- **External side effects:** muốn email/Telegram/webhook phải có durable outbox, dispatch workers, dedupe key, retry/backoff, DLQ, signing + SSRF egress policy + per-user consent. Không gọi webhook ngay giữa board CAS transaction.
- **App connections:** OAuth authorization-code/PKCE khi phù hợp; server-side callback, state/nonce, encrypted credentials, refresh token lifecycle, revoke/disconnect, scopes tối thiểu, multi-user isolation.
- **MCP:** registry theo connector/tool, discovery, host permission, transport security, schema allowlist, timeouts, audit. MCP SDK trong package.json không chứng minh đã có connector.
- **Agent access:** read tự động theo quyền; write/delete/external sends có confirmation policy, allowlist capability, verified receipt. Người dùng đăng nhập qua giao diện nhưng nhà phát triển vẫn cần đăng ký OAuth app/client và cấu hình provider.
- Triển khai thử một connector thấp rủi ro (ví dụ GitHub read-only) trước các thao tác ghi; không phụ thuộc API key model do người dùng cung cấp.

**Gate W5:** connect → approve scope → search/read → disconnect → token revoke có E2E; cross-account isolation đạt; không phát tán token cho client hoặc model logs.

### W6 — Security, observability và operational readiness (P0 xuyên suốt)

- Threat model: auth/session, board/resource ACL, tenant isolation, public links, arbitrary HTML, URL preview SSRF, file MIME/parser/image bombs, WS token, scheduler secret, agent prompt injection, OAuth CSRF, external tool escalation.
- Pin phiên bản dependencies thay vì “latest” cho runtime quan trọng; kiểm tra advisory/security và chỉ nâng version trong PR riêng có test.
- Backup Postgres, Mongo và blobs đồng bộ theo restore point; kiểm thử restore trên staging. Rotation secrets, rate limiting, upload limits, retention và xóa dữ liệu.
- Structured logs có boardId/turnId/operationId (ẩn PII); trace cho save/realtime/AI/scheduler; alert khi lỗi commit, retry storm hoặc jobs im lặng.
- Canary rollout feature flag, migration dry-run, documented rollback. Điều chỉnh ngân sách latency bằng dữ liệu baseline thật thay vì tự suy đoán SLA.

**Gate W6:** không còn blocker P0/P1 thuộc bảo mật hoặc dữ liệu, runbook có người chịu trách nhiệm rõ, restore đã chạy thực tế.

## 6. Quyết định về thứ tự triển khai

1. **Không** bắt đầu bằng rewrite toàn bộ sang CRDT hoặc đổi framework. Trước tiên bảo vệ save/revision và CI.
2. Chạy W0 → W1 rồi tiến hành song song W2 (spike), W3 (tests/perf), W4 (agent parity); merge từng lát nhỏ có feature flag.
3. W5 chỉ mở khi W2/W4 đạt trust boundary; AI connector ngoài đòi hỏi bảo mật và sự đồng ý của người dùng.
4. W6 là tiêu chuẩn ngang cho tất cả PR; không chờ cuối dự án mới làm security.
5. Mỗi đợt hoàn thành phải cập nhật checklist trong [Backlog](./02-implementation-backlog.md), dẫn link PR, SHA, CI run và bằng chứng staging.

## 7. Out-of-scope rõ ràng

- Xây Microsoft/Google Docs/Notion/PowerPoint clone với 100% API equivalence.
- Cam kết hỗ trợ mọi định dạng, mọi chức năng của một thư viện.
- Agent shell execution tùy ý hoặc provider API key lưu trong browser.
- Full CPM resource planning cho Gantt (hiện chỉ là longest dated dependency chain).
- Nhiều người cùng sửa Collection realtime nếu chưa vượt qua gate W2.
- Webhook/email/Telegram tự vận hành khi mới chỉ có scheduled field update.

## 8. Công thức nghiệm thu cuối

Không dùng điểm cảm tính để quyết định release. **Release = W0/W1/W6 gates xanh + các module đã bật production đạt acceptance + documented known limitations + backup/restore thử thành công + theo dõi sau release.** Hạng mục mới còn PLANNED phải tắt feature flag hoặc công bố chưa hỗ trợ.

Ghi chú: tài liệu này dựa trên đọc source và metadata GitHub tại baseline; nó không khẳng định các test đã được chạy tại thời điểm viết.
