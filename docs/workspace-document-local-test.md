# Bàn giao kiểm thử local: Document / TipTap

## 1. Phạm vi và trạng thái bằng chứng

Nhánh `feat/document-completion` bổ sung định dạng chữ, công cụ tìm/thay thế và thao tác dòng; ảnh tải bất đồng bộ; bảng TipTap và bảng Workspace nhúng; sao chép/import/export; chế độ chỉ xem Office; cộng tác Document bằng Yjs XML cùng dịch vụ WebSocket và checkpoint PostgreSQL.

**Đã có kiểm chứng tập trung bằng unit/schema/jsdom:** Markdown và ID tham chiếu roundtrip; cột bảng native giữ kích thước 240/120 qua AI; copy/cut bảng kèm attachment và sheet lưu; sanitizer/HTML/SVG transformer; khôi phục/xóa và ownership; viewer lock khi mạng lỗi, chặn sửa ô và giữ khả năng sửa của editor. Test dùng schema/transaction thật ở các điểm này, không thay thế việc render browser hoặc ghi DB thật.

Kiểm tra tích hợp cuối trong phiên triển khai: **198 test / 33 file đạt, 0 lỗi, 0 bỏ qua**, chạy với Node 24.19.0 và Vitest 4.1.9. Nhóm này gồm `doc-*`, `document-*`, `agent-doc-*`, `workspace-ws-*`, editor/Office, sanitizer, metadata/outbox, manual save và revision conflict. Repository/socket giả lập trong một số test chỉ kiểm chứng logic giao thức; chưa phải kiểm thử kết nối thật.

Lockfile được tạo bằng pnpm 9.10.0 và qua kiểm tra `--lockfile-only --frozen-lockfile --offline`. Prisma Client đã generate thành công. Typecheck toàn repo trả exit 2 trong môi trường dependency tập trung hiện tại, với 0 diagnostic thuộc các file thay đổi; chưa xác nhận full install/typecheck/build. Các lỗi còn lại nằm ngoài tập file sửa, gồm dependency/type declaration chưa có và type diagnostics cần đối chiếu trong môi trường local đầy đủ. Báo cáo local phải ghi kết quả thực tế của chính lần chạy đó.

**Còn phải xác nhận local:** cài đủ dependency từ lockfile, typecheck/build toàn app, browser có xác thực, dịch vụ realtime kết nối app thật, PostgreSQL, upload/storage, AI provider và các file export đã mở/render lại. Không đánh dấu các mục này hoàn thành theo kết quả unit hiện có.

Tài liệu hợp đồng: [realtime](workspace-document-realtime.md), [export](workspace-document-export.md). Đọc hai tài liệu này trước khi đánh giá hành vi mong đợi.

## 2. Chuẩn bị dependency, cấu hình và DB

Chạy tại gốc repository. Dùng Node 22.13+ hoặc Node 24 và **pnpm 9.10.0**; không dùng thư mục dependency tạm của phiên audit làm bằng chứng full install.

```sh
corepack prepare pnpm@9.10.0 --activate
pnpm --version
pnpm install --frozen-lockfile
```

Nếu chưa có cấu hình local, sao chép `.env.example` sang `.env.local` rồi điền giá trị của môi trường kiểm thử. Không ghi secret vào commit, output test, ảnh chụp hoặc báo cáo. Bảo đảm `DATABASE_URL` có trong environment của Prisma CLI; không mặc định CLI sẽ đọc `.env.local` như Next.js.

| Cấu hình | Nơi dùng / yêu cầu |
| --- | --- |
| `DATABASE_URL` | App/Prisma; PostgreSQL riêng cho kiểm thử, đã áp dụng toàn bộ migration. |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | App; URL local và secret phiên hợp lệ. |
| `WORKSPACE_DEV_USER_EMAIL` | Danh tính phát triển. Cơ chế dev chỉ dùng khi chạy development. |
| `WORKSPACE_WS_TOKEN_SECRET` | App và service dùng cùng một secret ngẫu nhiên; không dùng chung giá trị với secret đăng nhập. |
| `NEXT_PUBLIC_WORKSPACE_WS_URL` | App: `ws://localhost:3002`; phải có trước build. |
| `WORKSPACE_WS_INTERNAL_URL` | App: `http://127.0.0.1:3002`. |
| `WORKSPACE_INTERNAL_API_ORIGIN` | Service: `http://127.0.0.1:3000`. |
| `WORKSPACE_WS_HOST`, `WORKSPACE_WS_PORT` | Local có thể dùng `127.0.0.1`, `3002`. |
| `PROJECT_KNOWLEDGE_STORAGE`, `WORKSPACE_RESOURCE_STORAGE` | Có thể chọn `disk` cho local; thư mục ghi phải hoạt động. Ảnh `/api/workspace-images` dùng knowledge storage. |
| `OSS_*` | Chỉ cần nếu kiểm thử backend OSS: access key ID/secret, region, bucket và endpoint tương ứng. |
| `MONGODB_URI`, `MONGODB_DATABASE`, `MONGODB_DATABASE_AI` | Chuẩn bị theo các module app/AI đang chạy; checkpoint Document của service mới lưu qua PostgreSQL. |
| `WORKSPACE_AGENT_*DIFY_API_URL`, `WORKSPACE_AGENT_*DIFY_API_KEY` | Endpoint và key cho provider AI được chọn. Các nhóm local/model-step dùng biến tương ứng trong `.env.example`. |
| `WORKSPACE_AGENT_TOKEN_SECRET`, `WORKSPACE_AGENT_SERVICE_KEY` | Cần khi kiểm thử luồng agent gọi API có xác thực; không thay bằng bỏ kiểm tra quyền. |

Áp dụng schema và generate client trước khi chạy service/app mới:

```sh
pnpm exec prisma migrate deploy
pnpm prisma:generate
pnpm exec prisma migrate status
```

Xác nhận migration `20261019160000_add_workspace_document_state` đã chạy, cột `workspace_boards.documentState` tồn tại. Không dùng reset DB đang chứa dữ liệu cần giữ.

**Thứ tự rollout: migration → service realtime → app.** Service chạy một instance cho namespace room này; chưa có bộ điều phối room cho nhiều instance. Chưa mở traffic kiểm thử cho đến khi cả service và app sẵn sàng.

Terminal A, sau migration:

```sh
pnpm workspace:ws
```

Terminal B:

```sh
pnpm dev
```

Kiểm tra `GET http://127.0.0.1:3002/health` trả 200, rồi mở `/workspace` và `/office/document?boardId=...&blockId=...`. Health chỉ xác nhận listener/service đang hoạt động; phải mở room và lưu thật để xác nhận đường service → app → DB. Xem biến môi trường, endpoint nội bộ và cơ chế retry trong tài liệu realtime.

## 3. Các lệnh kiểm tra tự động

Chạy lại test tập trung sau full install:

```sh
pnpm exec vitest run \
  __tests__/workspace/doc-* \
  __tests__/workspace/agent-doc-* \
  __tests__/workspace/document-* \
  __tests__/workspace/workspace-ws-*.test.ts \
  __tests__/workspace/workspace-ydoc-persistence.test.ts \
  __tests__/workspace/workspace-metadata-realtime.test.ts \
  __tests__/workspace/workspace-realtime-outbox.test.ts \
  __tests__/workspace/workspace-rest-save-safety.test.tsx \
  __tests__/workspace/workspace-conflict-revision.test.ts \
  __tests__/workspace/workspace-manual-save.test.tsx \
  __tests__/workspace/ws-token-route.test.ts \
  __tests__/workspace/agent-html.test.ts \
  __tests__/workspace/office-app.test.ts --maxWorkers=1
```

Kiểm tra toàn bộ local; ghi riêng lỗi có sẵn, lỗi thiếu cấu hình và hồi quy từ nhánh này:

```sh
pnpm exec tsc --noEmit --incremental false
pnpm check:workspace-commands
pnpm check:workspace-agent-source
pnpm check:workspace-parity
pnpm test:workspace
pnpm build
git diff --check
```

`pnpm build` đã gồm Prisma generate. Sau build, dừng dev đang chiếm port 3000 rồi chạy `pnpm start` để smoke test bản production. Dev credentials không hoạt động trong production; chỉ ghi nhận luồng authenticated production nếu môi trường có auth phù hợp.

Test DB hiện có được opt-in bằng `WORKSPACE_RUNTIME_TEST_DB=1` và yêu cầu tên DB bắt đầu `workspace_runtime_test_`. Chỉ chạy khi `DATABASE_URL` trỏ đúng DB kiểm thử riêng:

```sh
WORKSPACE_RUNTIME_TEST_DB=1 pnpm exec vitest run \
  __tests__/workspace/workspace-realtime-outbox-database.test.ts \
  __tests__/workspace/workspace-agent-history-database.test.ts --maxWorkers=1
```

Các test DB này bổ sung kiểm chứng transaction/outbox/history; vẫn phải chạy ma trận Document với service và browser thật bên dưới. Không tính test `skip` là đã đạt.

## 4. Fixture và cách ghi nhận

Tạo một board riêng gồm Doc A, Doc B, một bảng canvas chưa nhúng và một workbook nhiều sheet. Dùng ba browser context độc lập: owner, editor được chia sẻ quyền và viewer được chia sẻ quyền. Trong dev có thể dùng cơ chế `mock-email` có sẵn để chọn danh tính từng context; vẫn phải tạo đúng quyền board ở server. Thêm một context không có quyền để kiểm tra URL trực tiếp.

Doc A dài ít nhất ba trang khi in, chứa tiếng Việt có dấu/IME, emoji, heading, nested list/task, link, code, ảnh có caption, bảng native đã resize/merge và bảng Workspace có cell attachment. Giữ một bản fixture đầu vào để so sánh sau copy/import/restore.

Mỗi ca ghi: browser/phiên bản, vai trò, board/block ID của fixture, bước tái hiện, kết quả, revision trước/sau và file bằng chứng. Khi kiểm tra bền vững, mở lại trong context sạch hoặc sau khi xóa cache riêng của fixture; không chỉ xem lại dữ liệu còn trong memory/localStorage.

## 5. Ma trận browser / DB cần thực hiện

Tất cả các mục dưới đây là **cần xác nhận local**, chưa được thay bằng kết quả unit.

| ID | Thao tác | Tiêu chí đạt |
| --- | --- | --- |
| F1 | Canvas và Office: chọn chữ, bold/italic/underline/strike, H1–H3, font, size, màu chữ/highlight, line-height, căn lề. | Toolbar phản ánh selection; gõ tiếp đúng mark; reload và export HTML giữ định dạng. |
| F2 | Nested bullet/number/task; toggle task; code block, quote, divider; undo/redo bằng phím và toolbar. | Không mất cấu trúc; undo/redo đúng thao tác. Khi cộng tác, undo của A không xóa sửa đổi độc lập của B. |
| F3 | IME tiếng Việt, chọn/thay thế, find next/previous, replace/replace all, duplicate/move/delete dòng. | Không mất chữ đang composition; selection/focus ổn định; line ID không trùng do thao tác sao chép; số từ/ký tự cập nhật. |
| I1 | Upload, paste và drop nhiều ảnh; delay upload rồi gõ thêm/xóa/chèn phía trước vị trí ảnh. | Ảnh vào vị trí đã được mapping; không ghi đè text vừa gõ; thứ tự và tiến trình hợp lý. |
| I2 | Mô phỏng upload lỗi; Retry; Cancel; xóa placeholder; đổi Doc hoặc rời editor khi upload còn chạy. | Không có ảnh “ma”, chèn nhầm Doc hay retry tạo bản đôi; nội dung đang gõ còn nguyên. |
| I3 | Đổi alt/caption, resize 15–100%, căn trái/giữa/phải; tải bản gốc. | Reload/AI edit/copy/export giữ attrs; caption hiển thị; tải được bytes gốc, không chỉ preview nén. |
| I4 | File quá lớn/không hợp lệ, URL ảnh không an toàn, ảnh ngoài bị CORS/404. | Có lỗi rõ ràng; không biến thành lưu thành công với nội dung bị mất. |
| T1 | Bảng native: resize cột, thêm/xóa hàng/cột, header, merge/split, điều hướng phím. | Sau AI sửa text và reload, cột 240/120 vẫn đúng; colspan/rowspan và cell text nguyên vẹn. |
| T2 | Tạo bảng Workspace nhúng và embed bảng canvas có sẵn; đổi cell/style/sheet. | Đúng bảng được cập nhật; ownership phù hợp; dữ liệu các sheet còn nguyên. |
| T3 | Copy/paste bảng A→B và trong A; cut/move; duplicate Doc; copy canvas; Markdown export/import vào board khác. | Bản copy độc lập, cả hai đầu ID và attachment ID được remap; sheet không active vẫn giữ attachment; cut không nhân đôi ngoài ý muốn. |
| T4 | Xóa embed, xóa Doc, xóa table; paste ID không tồn tại; undo/restore version. | Xóa embed/Doc giải phóng bảng và giữ dữ liệu; xóa table không để node lỗi; ID thiếu có thông báo; restore không chiếm bảng của Doc khác. |
| V1 | Viewer mở Office trực tiếp; delay/lỗi role refresh; click/double-click/keyboard/context menu trong bảng. | Không nháy edit controls; không vào cell editor, sửa/cắt/paste/resize/AI/rename; request ghi bị server từ chối. |
| V2 | Viewer tải HTML/in PDF; owner/editor mở cùng file; context không quyền mở deep link. | Viewer vẫn export được; editor vẫn sửa được; context không quyền không thấy nội dung file. |
| L1 | Tạo/sửa/gỡ link, mở link; copy deep link có `focusLine`; mở từ Office và canvas, dùng Open in new tab. | URL đúng, không thực thi scheme nguy hiểm; focus đúng dòng và không lặp jump; dòng đã xóa không gây crash; mở tab mới giữ nguyên tab đang soạn. |
| S1 | Gõ nhanh/chậm, Save, đổi Office file, Open on canvas, đóng/mở lại sau xác nhận lưu. | Snapshot cuối trên server trùng nội dung; trạng thái lưu và lỗi phản ánh thật; không bị HTML cũ ghi đè khi mount. |

## 6. Cộng tác, reconnect và xác nhận bền vững

| ID | Thao tác | Tiêu chí đạt / bằng chứng |
| --- | --- | --- |
| C1 | Hai editor sửa đồng thời cùng đoạn (hai vị trí), khác đoạn, format và chèn/xóa; sau đó sửa Doc A và B cùng board. | Hai phía hội tụ và giữ sửa đổi độc lập; không còn whole-HTML last-writer-wins; không lẫn fragment giữa Doc. |
| C2 | Ngắt WebSocket nhưng giữ HTTP; gõ/xóa rồi reconnect. Gõ khi đang live, ngắt socket và bấm Save/Back ngay. Sau đó ngắt cả mạng và nối lại. | Fragment không bị tháo mất nội dung offline; checkpoint/REST recovery không replay chữ hai lần; Save/Back chờ bản nháp thật, không dùng kết quả REST cũ; lưu lại đúng sau reconnect. |
| C3 | Delay lần sync đầu; gõ trước handshake trong khi peer có dữ liệu mới; lặp với bản local chưa lưu. | Có flush/recovery rồi kết nối lại; không seed snapshot local cũ lên peer; lỗi REST giữ pending và không báo đã lưu. |
| C4 | Delay một phản hồi lưu `sync-board` bằng harness/proxy local; trong lúc đó REST/AI commit revision mới; bỏ delay. | Xung đột CAS được phát hiện/rebase; cả sửa đổi hợp lệ còn nguyên; revision tăng, không rollback theo notification cũ. |
| C5 | Khi đang lưu snapshot N, gõ/xóa thêm N+1; thử ca chỉ xóa ký tự. | Receipt N không xác nhận N+1. Pure deletion vẫn pending đến receipt có state vector tương ứng. |
| C6 | Peer đang gõ; owner chạy AI sửa selection/whole Doc, rồi restore version. Lặp với embed và resized native table. | Thay đổi REST/AI/version đến room đang mở; peer hội tụ, không vòng lặp autosave; widths/attrs và ownership còn đúng. |
| C7 | Mất đường service→app hoặc DB trong lúc dirty; đóng client cuối; khôi phục kết nối. | Room giữ dirty và retry, không gửi xác nhận lưu giả; DB nhận bản cuối khi hoạt động lại. |
| C8 | Sau receipt thành công, restart service và mở bằng browser context sạch. | Nội dung, ảnh/table refs và checkpoint bền vững; không cần localStorage cũ để khôi phục. |
| C9 | Hạ editor thành viewer/thu hồi quyền; thử kết nối/token cũ và gửi update bằng fixture test. | Session bị ngắt hoặc từ chối theo quyền; editor chuyển sang chỉ xem khi quyền mới được xác nhận; viewer nhận sync nhưng không ghi được; receipt/presence không do client giả mạo. |
| C10 | Hai editor có sửa đổi chưa lưu; thu hồi quyền người sửa cuối trước idle flush. Lặp với chỉ viewer còn lại, rồi thêm lại editor có quyền. | Sửa đổi đã nhận còn nguyên; lần lưu dùng writer được API xác thực lại; khi không có writer thì giữ dirty, không gửi receipt giả. |
| C11 | Làm PUT lỗi mạng/5xx rồi bấm Save; lặp với 409 khi không còn merge ancestor. | Lỗi tạm thời được thử lại có giới hạn. Xung đột chưa giải quyết không bị ghi đè bằng revision vừa đọc; draft giữ nguyên đến khi merge/reconnect hoặc xử lý xung đột. |

Đọc row fixture trong PostgreSQL để so sánh `revision`, `blocks`, `documentState` trước/sau. Checkpoint phải hiện diện sau lần service lưu và biểu diễn đúng HTML hiện tại khi tạo room lại. API công khai/trình duyệt không trả raw `documentState`. Không in toàn bộ checkpoint/token vào log bằng chứng.

Phân biệt graceful shutdown với hard kill: chỉ cam kết bền vững cho edit đã được xác nhận lưu; mô phỏng kill trước receipt phải giữ trạng thái chưa xác nhận, không báo “đã lưu” dựa vào việc còn text trên màn hình.

## 7. Export và kiểm tra file thật

| ID | Thao tác | Tiêu chí đạt |
| --- | --- | --- |
| E1 | Download HTML, mở file ngoài app rồi offline. | Đủ mọi trang/nội dung; typography, task, link, ảnh/caption và bảng hiện đúng; displayed image đã nhúng; original-download còn là link. |
| E2 | Markdown toàn board và Doc-only selection; đọc phần visible rồi reimport. | Có nội dung Doc thay vì `(empty)`; bảng không lặp; metadata remap đúng; font/layout không được coi là bảo đảm của Markdown. |
| E3 | Canvas PNG/SVG/PDF với Doc và bảng nhúng; chọn riêng embedded table. | Frame có nội dung thật, không file trắng; không vẽ bảng/attachment trùng ngoài Doc; selection riêng vẫn export được. |
| E4 | Print / Save PDF từ editor và viewer; lưu PDF nhiều trang, mở bằng PDF viewer. | Đủ nội dung, text chọn/copy được, tiếng Việt/ảnh/caption/merge table rõ; kiểm tra page breaks. Canvas PDF là ảnh frame, không phải full-document PDF. |
| E5 | Ảnh CORS/404, ảnh vượt giới hạn, popup bị chặn, browser/SVG viewer không hỗ trợ. | Báo lỗi có hành động khắc phục; không đánh dấu export trống là thành công. Kiểm tra lại sau khi sửa lỗi. |

Canvas export giữ kích thước frame và cắt phần tràn ở đầu nội dung; full-document HTML/Print mới bao phủ toàn bộ tài liệu. SVG cần hỗ trợ `foreignObject`. Bảng spreadsheet xuất sheet active với display value đã lưu, không tự tính lại formula. Xem giới hạn ảnh/attachment trong hợp đồng export.

Lưu PNG, SVG, HTML, Markdown và PDF tạo từ cùng fixture; mở/render lại và đính kèm ảnh so sánh. Chưa có artifact browser/PDF thật chỉ từ việc transformer trả đúng chuỗi SVG/HTML.

## 8. Điều kiện bàn giao kết quả

- Ghi các lệnh đã chạy, exit code, số pass/fail/skip thực tế, phiên bản Node/pnpm/browser và commit được kiểm tra.
- Mỗi mục F/I/T/V/L/S/C/E có kết quả đạt/lỗi/chưa chạy; các ca lỗi có repro tối thiểu và bằng chứng đã che secret.
- Phân biệt thiếu provider/storage/auth với hồi quy code; không gọi nhóm bị skip là hoàn thành.
- Chốt bằng chứng full install/typecheck/build, browser, real service+DB và file export riêng. Không cần chờ CI để sửa lỗi local trong phạm vi đã được giao.
