# Office Slide Deck: rich typography and editable vectors

Date: 2026-10-19. Branch: `feat/office-slide-scene-v2`, PR #56.

This batch continues from `c817724c7603e6c006b3a76558a0735443094b99`, retaining the local agent's native-table normalization and merged-cell fixes and the existing multistage animation implementation. Historical handoffs describe earlier milestones; they are not the current capability inventory.

## Integration boundary

Workspace is an identity-neutral extracted module that will be attached back to the original app, and is also tooling for `eddyvn98/agent-web`. This work changes the slide data/editor/render/import/export modules and the pure authoring SDK only. It does not implement, replace or remove authentication, add a model account, create a second agent, run arbitrary generated code, or change the host's persistence/command endpoint contract. Existing read-only/lock and stale-edit guards remain in use.

No new package dependency was added. The formatting editor uses the ProseMirror packages already exposed by `@tiptap/pm`.

## Implemented: structured rich text

`SlideSceneObject.richText` stores versioned paragraphs and runs, not executable HTML. The model retains independent bold/normal, italic, underline, strikethrough, font family, scene-pixel font size, RGB color and run opacity. Paragraphs retain left/center/right alignment, line height, before/after spacing, bullets, decimal numbering, list level and explicit start value. Text boxes support top/middle/bottom vertical alignment.

The derived `text` property remains available for existing search, labels and consumers. It is generated from rich text, including list labels. Rich text is bounded to 200 paragraphs, 1024 input runs and 10,000 derived characters. Invalid/oversized structured content is rejected, not silently shortened.

- Existing plain-text objects still work with the lightweight in-place editor.
- **Format selected text** opens the rich draft editor. Imported rich text opens this editor on double-click/F2/Enter rather than flattening into a textarea.
- Formatting applies to selected text or paragraphs. Whole-box property controls deliberately remove the corresponding run overrides. Moving a box, changing its opacity or editing its animation does not flatten its contents.
- Apply writes one scene-history change; Cancel does not publish. Newer content/style changes to that same text object refuse the stale draft. Unrelated geometry changes are retained when applying to the current scene.
- Ctrl/Cmd+B/I/U and text undo/redo are supported. Enter creates a new paragraph, continuing numbered lists; Shift+Enter inserts a line break. Pasting is explicitly plain text, not untrusted rich HTML.
- Group resizing scales explicit run font sizes and paragraph gaps as well as the base text size.

The shared browser view is used by editor, thumbnails, presenter and animation preview. Effects continue to target the existing inner motion wrapper, not individual text-run positions.

## Implemented: vector shape coverage

The editor exposes 21 preset kinds plus custom paths: rectangles, rounded rectangles, ellipses, triangles, diamonds, pentagons, hexagons, octagons, parallelograms, trapezoids, chevrons, directional/double arrows, stars, plus signs, hearts and lines. Outline width and solid/dash/dot patterns are editable.

Custom paths have a numeric viewBox and 2-256 M/L/C/Q/Z commands. They can be authored by SDK code or edited as a validated JSON path draft in the inspector. They are not SVG strings, scripts or foreign HTML. Multiple subpaths can be expressed within the bounded command list. Changing back to a preset retains the stored custom draft for reuse.

A shared geometry helper supplies browser/PDF paths. Native PowerPoint export uses `a:prstGeom` for presets and `a:custGeom` for supported custom curves, so the shape remains editable, not a background screenshot.

## Import and export behavior

The existing PPTX importer now reads each supported run/paragraph rather than copying one style across the whole text box. Native export writes editable DrawingML runs with proper point-unit conversion, paragraph spacing/list properties, vertical anchor and effective opacity. Plain legacy boxes use the same serializer. Unicode, line breaks and explicit normal-weight runs inside a bold box are retained.

Recognized preset geometry and single numeric custom paths are imported as editable shapes. Rounded-corner adjustment, stroke width and supported dash modes are retained. Unsupported formulas, arc commands, multipath fill/effect structures, preset handle adjustments and line-end decorations produce specific compatibility notices rather than a blanket claim of full fidelity.

The PDF renderer preserves text-run styling through its wrapping process and uses the same vector geometry. It still uses approximate server-side text metrics; it is not a browser-font measurement engine. Compare wrapping and font substitution visually in the host app and exported files.

Native table support is retained. Table cells still use one style per cell, not arbitrary rich runs. Mixed run or paragraph formatting inside a cell is explicitly reported as reduced to a cell style; cell values, merges and native table structure remain intact. This notice is not a regression to the older text/shape-only table import.

## Pure SDK example

`SlideScriptSlide.richText(value, box, style)` and `.vector(path, box, fill, style)` share the same contracts as the app. `.shape()` accepts preset kind, custom geometry and outline properties. The SDK remains an ordinary deterministic authoring library; no script runner or agent orchestration was added.

```sh
pnpm exec tsx docs/examples/slide-rich-text-vectors.ts > rich-text-vector-deck.json
```

This produces `{action,warnings}` only. It does not save a board, authenticate or produce a PPTX file by itself. The original app can validate and dispatch `action` through its existing command executor. The example contains Vietnamese text, mixed typography, lists, preset shapes and a custom curve suitable for the local visual checks.

## Local agent verification handoff

Requested workflow: development continues without waiting for CI; full application verification is performed by the local agent. Do not reuse a previous SHA's green checks as a result for this batch.

New repository suites (written, not executed as full-repo Vitest in this environment):

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-rich-text.test.ts __tests__/workspace/slide-rich-text-pptx-roundtrip.test.ts __tests__/workspace/slide-scene-vector-shapes.test.ts __tests__/workspace/slide-rich-text-editor.test.tsx
pnpm exec vitest run __tests__/workspace/slide-pptx-import.test.ts __tests__/workspace/slide-file-export.test.ts __tests__/workspace/slide-scene-inline-text.test.tsx __tests__/workspace/slide-script-sdk.test.ts
pnpm test:workspace
pnpm build
```

Use the existing host/editor fixture for browser tests; no new login setup is part of this handoff.

1. Open a plain object, use in-place editing, then Format selected text. Change a few words to a different font/size/color, make one run normal in a bold box, add bullets/decimal numbering and paragraph gaps. Apply, undo/redo and reopen.
2. Open imported rich text; confirm formatting is retained without a mixed-run downgrade notice. Enter after an explicitly numbered paragraph must continue the number, not repeat it. Check Vietnamese input/composition, line breaks and pasted plain text.
3. Cancel a draft; no changes should publish. Change the same object's text/style in another client while the draft is open; Apply must refuse. A separate position/rotation edit must remain intact when a valid text draft is applied.
4. Resize/rotate a group containing mixed text, a table and a vector shape. Check run-size scaling, shape stroke scaling, table data and existing effects. Save/reload through the host persistence layer.
5. Exercise all presets, round-corner reset, stroke width/dash and a custom cubic/quadratic path. Enter invalid JSON, NaN-like values, unknown commands and too many commands; no invalid path should be saved.
6. Export PPTX, inspect native text runs and shape editability in actual PowerPoint, then reimport. Compare fonts, spacing, lists, opacity, geometry, crop, group membership and existing animation effects. Repeat with 16:9 and 4:3.
7. Export PDF and compare wrapping and vector outline clipping against the browser. Check font substitution instead of treating XML presence as proof of rendering fidelity.
8. Verify native tables and their merged-cell rejection behavior still pass the local agent's existing suites. A genuinely mixed-style cell should show a compatibility notice, not silently discard formatting.

Actually performed here: targeted strict TypeScript compilation for the pure rich-text, vector validation and JSON-codec modules, plus direct assertions for codec/list/path/transparent-text behavior and syntax inspection of the locally authored modules. No full repo build, ProseMirror/browser integration suite or actual PowerPoint rendering was executed here. Those checks remain with the local agent. No CI was awaited or claimed for the new HEAD.

## Explicit remaining limits

This batch completes the described rich-text/vector features, not universal PowerPoint parity. Full font shaping/embedding, arbitrary theme/master inheritance, vertical script direction, superscript/subscript and character spacing, active hyperlinks, all custom underline/list types, editable rich runs inside table cells, arbitrary SVG/Office path formulas and arc/multipath fill semantics, advanced charts/SmartArt, image masks/gradients/shadows and native nested groups still need separate coverage. Existing animation support must be validated against its own handoff; this batch neither removes it nor claims every PowerPoint timing construct is supported.
