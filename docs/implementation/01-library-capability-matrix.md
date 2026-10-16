# Workspace — Ma trận khai thác thư viện và quyết định kiến trúc

> **Baseline:** main 0f07e610 (2026-10-16). Đây là ma trận dựa trên package.json và một số code entry points; không phải kết quả static analysis toàn bộ import graph.  
> **Mục tiêu:** khai thác đúng khả năng có ích, không “dùng hết API của thư viện”.  
> **Trạng thái:** EXISTING = có source tích hợp; PARTIAL = có khả năng quan trọng chưa dùng/hạn chế rõ; AUDIT = phải xác minh trước khi kết luận; PLANNED = chưa được coi là có.

## 1. Bản đồ phụ thuộc

| Nhóm | Thư viện | Bằng chứng hiện có | Gap / hành động | Gate |
|---|---|---|---|---|
| Realtime | yjs, y-websocket, y-protocols | lib/workspace/ydoc.ts; lib/workspace/ydoc-shapes.ts | Cả block là một map value; Collection vô hiệu hóa WS trong useWorkspaceRealtime.ts. Làm ADR REST CAS vs granular CRDT, write-fencing + migration | Concurrent E2E 2 phiên, rollback |
| State | zustand, immer | app/workspace/store/, stores/ | Audit selector churn, stale snapshot writes, derived state; không rewrite state toàn diện | Rapid-edit và render profiling |
| Docs | @tiptap/* | app/workspace/renderers/WorkspaceDocRichEditor.tsx | Đang có image/table/task/heading/link/slash; test lưu HTML, remote edit, selection và accessibility | Round-trip golden fixture |
| Spreadsheet | @fortune-sheet/core/react/formula-parser | app/workspace/components/table/WorkspaceSpreadsheetEditor.tsx; workspaceTableWorkbook.ts | Tích hợp workbook thật; cần kiểm chứng formula/format/merged/freeze/import-export và AI parity | Workbook fixtures + Excel diff |
| Collection Table | @tanstack/react-table | app/workspace/renderers/CollectionTableView.tsx | Có multi sort và pagination; giữ như hiện tại đến khi benchmark chứng minh cần virtual | 200/1k/5k rows, typing latency |
| Virtualization | @tanstack/react-virtual | package.json | Chưa xác minh usage toàn repo; chỉ dùng nếu DOM lớn là bottleneck | Perf improvement measurable |
| Kanban | @dnd-kit/core, utilities | CollectionKanbanView.tsx | Có mouse/touch/keyboard sensor; kiểm chứng thứ tự thẻ, drag target, pointer cancel, keyboard accessibility | Desktop + mobile E2E |
| Graph | @xyflow/react | CollectionMindMapView.tsx | Có Controls, MiniMap, pan/zoom, reparent; view đang giới hạn 200 nodes; custom nodes và graph scalability chỉ làm nếu có use case | Large graph + reparent integrity |
| Image editor | konva, react-konva | components/features/ai-image-editor/ai-image-editor.tsx | Bảo toàn precision, export, hit-test, undo, touch; refactor file lớn trước khi thêm tools | Pixel/interaction regression |
| Slides/charts | echarts, chart.js, react-chartjs-2, recharts | package.json; app/workspace/components/slides/, lib/workspace/pptx-* | Có nhiều hệ biểu đồ; cần import graph xác minh màn hình nào cần engine nào, không gỡ theo suy đoán | Golden chart/export parity |
| Math/diagrams | katex, mermaid, remark-math | package.json; markdown/canvas surfaces | Audit sanitize, markdown injection, render consistency và PDF export | Security/visual tests |
| Model runtime | Dify adapters, openai SDK | lib/llm/adapters/difyAdapter.ts; lib/workspace-agent/difyModelProvider.ts | Workspace Agent theo Dify; không tạo đường gọi provider trực tiếp vượt chính sách | Dify auth, timeout, receipts |
| MCP | @modelcontextprotocol/sdk | package.json | **AUDIT:** package dependency không phải OAuth connector hub; chưa có bằng chứng use-case đăng nhập app qua UI | Connect/auth/revoke E2E |
| Embeddings | @xenova/transformers, @huggingface/transformers | lib/embeddings.ts thực dùng @xenova/transformers all-MiniLM-L6-v2 | Xác định @huggingface còn dùng không, model cache, WASM memory/latency; không gỡ trước import scan | Index/retrieval performance + source ACL |
| Knowledge | vectra, pg, Prisma | lib/workspace/knowledge-search.ts | Có full-text + vector + keyword fallback; kiểm chứng giới hạn token, accuracy, index size | Grounded answer benchmark |
| DB | prisma/@prisma/client, mongodb, pg | lib/prisma.ts, services/mongodb/, prisma/models/ | Transaction/CAS, migration, backup/restore, connection pools, retention | Real DB integration + restore |
| Auth/UI | next-auth, jose, antd, @radix-ui/* | auth routes, components/ui, package.json | Audit identity, permission check, redirect/cookie policies, accessibility; không thay UI kit hàng loạt | Role matrix + a11y |
| Files | pdfjs-dist, pdf-parse, mammoth, exceljs, xlsx, sharp, jszip | file preview/import/export paths; lib/workspace/pdf-export.ts | PDF slide hiện chuyển SVG thành JPEG; cần lựa chọn xuất dạng vector nếu text selectable là yêu cầu | Golden file compare |
| Video | ffmpeg-static, fluent-ffmpeg | package.json, video generation types | Audit thực dùng và native runtime compatibility; phân tích file tải lên không an toàn | Media smoke + cancellation |
| Data fetching | @tanstack/react-query | package.json | AUDIT ownership cache và retry; tránh dùng song song nhiều cache conflict ở board writer | No duplicate mutation |
| Tests | Vitest, Playwright, Testing Library | __tests__/workspace, __tests__/browser | Phủ contract thật, fixture khác staging, bắt buộc CI | Release runbook |
| Cleanup | knip, TS, pnpm-lock | package.json, pnpm-lock.yaml | Phát hiện import/dep dư, phiên bản latest, bundle bloat; review false positive dynamic import | knip report + build diff |

## 2. Quyết định cụ thể theo nhóm

### 2.1 Yjs và persistence: ưu tiên correctness, không “bật WS”

**Current:** lib/workspace/ydoc-shapes.ts mô tả block là map value; app/workspace/hooks/useWorkspaceRealtime.ts bỏ kết nối khi có Collection. REST CAS/three-way merge trong Collection là guard để không ghi đè dữ liệu.

**Điểm lựa chọn kỹ thuật:**
- **Phương án A:** giữ REST CAS, bổ sung SSE/WS revision invalidation, optimistic updates, conflict UI tốt hơn. Ít migration; đủ nếu nhu cầu 2 người không cần cùng sửa realtime.
- **Phương án B:** granular Yjs data model: Y.Map(recordsById) + Y.Map(fieldsById) + Y.Array(order) + Y.Text cho rich notes khi phù hợp. Phải định nghĩa schema/revision/permission/delete, không chỉ thay một object JSON bằng Y.Map.
- PoC hai phương án, đo chi phí và conflict, chọn bằng ADR. Nếu B, migration có version guard, shadow compare, feature flag và switchback.
- Không chạy cả REST autosave và Yjs writer trên cùng một board khi không có fencing.

**Không được đánh dấu DONE:** chỉ vì 2 cửa sổ “cùng thấy thay đổi” trên máy local nhưng offline/legacy client vẫn có thể overwrite.

### 2.2 Collection: không phải một CRUD demo

**Đã có:** 7 view từ Collection model: table, kanban, calendar, timeline, gallery, mindmap, form. Fields text/number/date/select/checkbox/url/image/relation/lookup/rollup/formula, status automation, scheduled rules, record notes, audit capped, dependencies/Gantt.

**Tận dụng đúng:**
- TanStack Table đã phân trang 25/50/100/250 và sort manual theo view: không bật thêm internal sorting khiến double-sort.
- Virtualize khi cần render hàng nghìn visible rows trong cùng viewport; đo DOM nodes/commit time trước.
- React Flow có limit 200 record ở CollectionMindMapView; thiết kế lựa chọn focus subtree, search/lazy expand hoặc virtualized graph, không phá tính nhất quán toàn bộ record ID.
- DnD phải xử lý cả touch/keyboard + alternative chọn status; đảm bảo không mất update trong state stale.
- Gantt hiện có dependency scheduling finish-to-start và longest dated chain; không tuyên bố là CPM có critical float/resources.

### 2.3 Rich Doc và Sheet: ưu tiên round-trip trước feature breadth

- Tiptap lưu content HTML về block: test paste, link, nested lists, image refs, tables, undo, AI edit, remote state. Test HTML sanitizer khi import và khi trả nội dung AI.
- FortuneSheet có cầu chuyển đổi TableBlock ↔ Workbook. Đặt fixtures đủ nhiều sheets/format/formula. Đầu tiên quyết định giới hạn định dạng cần chính thức hỗ trợ rồi hiện cảnh báo khi import fidelity thấp.
- Spreadsheet và Collection **khác schema**. “To Collection” hiện copy dữ liệu, không hứa đồng bộ hai chiều; formula spreadsheet được chuyển thành display text. Nếu yêu cầu link/live conversion thì là dự án tách riêng.

### 2.4 AI / Dify / MCP: ba khái niệm khác nhau

- **Dify:** cấp model, conversation/log. Workspace chỉ chấp nhận typed action, server validation, authorization, CAS và receipts. Không coi text “đã cập nhật” của model là proof.
- **Agent command registry:** 123 command entries tại baseline, trong đó 12 Collection actions. Registry count ≠ số lệnh được kiểm chứng bằng staging.
- **MCP SDK:** chuẩn gọi tools không tự cung cấp danh sách app, tài khoản, token, OAuth client và quyền. Connector Hub phải có credential vault, user consent và per-tool policy; cần app registration phía nhà phát triển, nhưng end user nên chỉ đăng nhập/approve trong UI.
- Subagent cùng dùng Workspace execution boundary và signed user context; không bypass ACL/confirm bằng việc gọi tool trực tiếp.

### 2.5 PDF, chart, image

- lib/workspace/pdf-export.ts raster hóa SVG sang JPEG rồi tạo PDF; ảnh thường đẹp nhưng không phải PDF text selectable. Nếu tiêu chí cần search/copy/accessible text thì xây exporter vector có text layer hoặc dùng export engine phù hợp và test bằng trích xuất text.
- Audit ba chart stacks: nếu chart engine dùng cho trải nghiệm khác nhau (render interactive vs export) có thể giữ nhiều, nhưng phải có lý do và lazy-load. Nếu chồng lắp, chuẩn hóa adapter trước khi tháo thư viện.
- Image/video upload cần caps pixel/duration/bytes, EXIF cleanup theo yêu cầu, MIME sniffing, timeout, thumbnail memory budgets, cancel/retry.

## 3. Audit workflow không phá sản phẩm

1. Tạo branch perf/dependency-audit; chạy install đúng pnpm-lock, TS, Vitest và build baseline.
2. Chạy **pnpm exec knip**, thu danh sách suspect; kiểm tra dynamic imports, Next filesystem routes, runtime workers, codegen/Prisma trước khi kết luận unused.
3. Lập bảng thực dùng gồm: package, first-party import paths, lazy chunk, bundle contribution, owner, license/security, quyết định keep/consolidate/remove.
4. Mỗi PR chỉ gỡ hoặc thay một nhóm dependency; chạy golden E2E, export snapshots và đo bundle. Pin version thay vì latest nếu chứng minh tương thích.
5. Không tự động đổi major Next/React/Tiptap/Prisma/TS chỉ vì bản mới hơn; có release migration riêng.

~~~bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm test:workspace
pnpm exec knip
pnpm build
~~~

## 4. Template kết luận cho từng thư viện

~~~text
Library:
Version/lockfile SHA:
Feature consumed (evidence file+line):
Feature planned (customer value):
Feature explicitly not planned:
API/runtime compatibility:
Security/license:
Proposed action: keep / optimize / consolidate / remove
Risk & rollback:
Test/CI run:
Status: PLANNED / IN_PROGRESS / VERIFIED / DEFERRED
~~~

## 5. Các cảnh báo không suy đoán

- Chưa chạy import graph đầy đủ: **không kết luận** @huggingface/transformers, virtual, MCP SDK hay chart stack là unused chỉ vì một tìm kiếm không trả về kết quả.
- Không tự nhận performance pass khi chưa có benchmark hoặc CI thật.
- Hai database và WebSocket cùng tồn tại là chi phí vận hành có thật; chỉ hợp nhất sau khi có đánh giá migration và tính đúng đắn.
- Refactor nhiều file lớn (đặc biệt ai-image-editor.tsx, lib/mindmap/repository.ts, useImageSettingsStore.ts) theo chức năng và regression test; giới hạn 300 dòng/file là guideline phát triển, không phải lý do chấp nhận thay đổi cấu trúc làm hỏng hành vi.

**Tiếp theo:** mở [Implementation backlog](./02-implementation-backlog.md) và gắn mỗi gap vào một issue có acceptance rõ.
