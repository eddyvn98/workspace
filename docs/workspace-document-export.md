# Document persistence, copying and export contract

Document content is stored as schema-supported HTML. Images retain preview URL, original-download URL, alt text, caption, percentage width and alignment. Native TipTap tables retain merged cells and column widths. Workspace table nodes reference separate board blocks by stable IDs.

## Portable copies and imports

Selecting a Document for Markdown/JSON export includes its embedded Workspace tables. Markdown has a readable body (headings, marks, links, lists, images, captions and table data) plus the existing `WORKSPACE_DATA` JSON metadata for exact Workspace reimport. Merged HTML tables remain semantic HTML because Markdown pipe tables cannot express merged cells. Font colors/families and layout are not a Markdown interchange guarantee; use HTML for those.

Markdown import, clipboard paste and duplication generate new IDs and remap both the Document's table node and the table's `embeddedInDocId`. A missing table dependency becomes a visible unavailable-table message rather than accidentally linking to a table in the destination board. JSON restore replaces the board and therefore retains its original consistent IDs.

Copying an inline Workspace table also copies its cell attachment blocks and remaps their IDs. Pasting a copied table creates an independent table even within the same Document. A local cut transfers the original table after the source Document releases it; a missing or foreign table ID becomes a visible unavailable message. Read-only editors cannot create table dependencies through paste.

Removing an embed from a Document releases the table to the canvas, preserving its cells. Deleting the Document also releases its tables. Deleting the table removes stale embed nodes. These changes participate in the workspace history/persistence update.

Live collaboration derives table ownership deterministically from the current Document HTML without writing timestamps during projection. A currently referenced owner stays the owner; otherwise the first referencing Document by ID becomes the owner. An unreferenced table is released, including after remote Document deletion.

## Export surfaces

| Action | Output and supported scope |
| --- | --- |
| Document: Download HTML | Complete flowing document with headings, text styles, lists/tasks, links, images/captions and expanded Workspace tables. Images are embedded in the file; original-download links stay available online. |
| Document: Print / Save PDF | Opens the complete document in the browser print dialog, with A4 print CSS and pagination. Choose Save as PDF for a text-selectable PDF. The browser determines line/page breaks and installed font substitutions. |
| Canvas PNG / SVG / PDF | The canvas frame's document appearance, at the top of its scrollable content. The fixed frame clips overflow as on the canvas. Use the Document actions for all pages of a long document. |
| Workspace JSON | Complete editable Workspace representation; image URLs still require access to their backing storage. |

Canvas document rendering uses self-contained SVG `foreignObject` with browser-rendered XHTML. SVG consumers must support that SVG feature. PNG and canvas PDF rasterize it; they do not provide selectable text. Unsupported browser rendering or an inaccessible image fails visibly instead of producing a successful blank document export.

Embedded spreadsheet export uses the active sheet's stored display values and supported cell formatting (merges, column proportions, alignment, colors and font sizes). Formulas are not recalculated during document export. Use workbook export for all sheets, formula source, validations, freeze panes and spreadsheet-specific metadata.

Embedded table image, text, link, shape-label and file-name attachments are rendered as flowing cell content. Their freeform canvas offsets are not carried into page layout. Unsupported attachment types display an explicit workspace-view message. Supported bar-chart atoms render their labels, values and bars from saved chart data.

Image preparation supports PNG, JPEG, GIF, WebP and AVIF. It requires an accessible same-origin URL or an external server that permits browser CORS reads. Limits are 20 MB per image and 64 MB total image bytes. An unavailable, oversized or unsupported image stops the export and gives an actionable error. The original-download link remains a link, while the displayed image is embedded.

## Local validation handoff

Run focused Vitest tests `doc-lifecycle-roundtrip.test.ts`, `doc-export-safety.test.ts`, existing `agent-doc-*`, plus clipboard/duplicate/import/delete regressions. The new tests use real schema serialization and actual HTML/SVG preparation; they do not claim rendered-browser, persisted-database or generated-PDF validation.

Browser checks: create a multi-page document containing Vietnamese, styled paragraphs, nested tasks, links, a captioned image, resized/merged native table and an embedded spreadsheet. Save/reload, duplicate and reimport it; verify independent table ownership. Export HTML and reopen offline; print all pages to PDF and confirm text selection, page breaks and image fidelity. Export its canvas frame to PNG/SVG/PDF and compare the frame with the on-screen content. Repeat blocked image, popup-disabled and read-only cases. No authenticated browser/DB/CI gate is represented as completed by these source changes.
