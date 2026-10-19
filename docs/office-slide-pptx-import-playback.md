# Office Slide Deck: PPTX import and click-build playback

Date: 2026-10-19. Branch: `feat/office-slide-scene-v2`, PR #56.

This is the latest application-first handoff. Earlier entries in `office-slide-deck-v2-status.md` are historical milestones; the import gap is now partly addressed as described here. No second agent, shell executor or sandbox was added.

## Delivered application workflow

The Office/Canvas deck toolbar now exposes **Import PPTX**. Selecting a file reads it locally and creates a staged result; it does not upload assets or mutate the board. A modal compatibility report lists unsupported or approximated content. The user must acknowledge reported differences before confirming **Append slides**.

After confirmation, embedded raster images are uploaded through the existing Workspace image upload helper. Slides and objects receive new IDs, references are replaced with persisted Workspace image URLs, and the imported slides are appended in one deck update. Existing slides are retained. The original PPTX file is never overwritten.

The import callback re-reads the live store, verifies the current board/block, read-only state, aspect ratio and exact deck snapshot. If the deck changed during parsing/upload, insertion is refused instead of overwriting edits. Cancelling/unmounting aborts further processing and publishing. An upload already in progress may finish and leave an unused image asset; no cleanup API is assumed.

The import uses existing JSZip, browser DOMParser and Workspace persistence. No new application package dependency was added. The parser is dynamically loaded after file selection.

## Supported content and explicit limits

- Standard `.pptx` packages, 1-60 slides, source slide order resolved from relationships rather than filenames.
- Solid backgrounds and basic theme colors/fonts; layout/master decorations and placeholder positions where available.
- Editable text preserving Unicode, paragraph text, bullets, one style per text box, font size, alignment, solid color and supported opacity.
- Rectangles/rounded rectangles and object positions/rotations. Other shapes are approximated with a notice; unsupported diagrams/objects are omitted with a notice.
- Embedded PNG/JPEG/GIF images, rectangular image frames, basic crop-to-fill and focal points. Animated GIF playback/export may differ.
- Native groups are read through their coordinate transforms, with members retained as editable objects. Nested groups flatten into the outer logical group. Shear and reflection are not fully reproduced and are reported.
- Table values become editable text/shape cells. The importer does not create a native editable table object. Merged cells require visual review.
- Supported single-series, nonnegative bar-chart cached data becomes a Scene V2 chart. Other charts fall back to cached numeric data text with a notice. Embedded workbook code is never executed.
- Presenter notes, hidden-slide flag and basic transition presets are read. Custom transition parameters are not faithfully reproduced.

**Not lossless:** mixed text run styles, italics/underlines, advanced shape geometry, arbitrary gradients/shadows, master formatting inheritance, SmartArt, video/audio playback, image masks, two-axis crops, full chart formatting, native nested groups and object animation import are not complete. Existing object timings are reported as not imported; users can reapply effects in the Workspace timeline. Strict Open XML, encrypted, legacy `.ppt` and `.pptm` files are rejected. Shape/object count or excessive text limits refuse the import rather than silently truncating data.

Resource controls: 25 MB input, 80 MB total expanded data, 15 MB per entry, 2500 ZIP entries, 3 MB per XML part, 30,000 XML elements, depth 64, group nesting 16, 120 scene objects/slide, 10,000 text characters/box and 24 supported chart values. These are implementation safety bounds, not claims of universal PPTX compatibility.

## Import trust boundary

ZIP central directory and local headers are checked before decompression. Absolute/traversing/ambiguous package paths, encryption, multipart ZIP and ZIP64 are rejected. Actual streamed output is bounded in addition to declared lengths, including falsely-small expanded-size headers. XML DTD/entity declarations are rejected. Relationships resolve within the package; external resources are never fetched or activated. Imported XML is parsed as data, never inserted as HTML. Macros/OLE/ActiveX are ignored with a warning.

Returned image URLs must match Workspace image URLs before insertion. Permission enforcement remains in existing Workspace upload/save endpoints and the live editor role checks. This is not a replacement for a deployment security review.

## Playback improvements

`slideScenePlayback.ts` compiles one schedule shared by the object timeline and presenter:

- `on-click` begins a new build; chained `with-previous` and `after-previous` remain inside that build.
- `with-previous` is relative to the previous effect's start; `after-previous` is relative to its end.
- `none` does not create an invisible click step.
- Future builds remain hidden; previous builds are visible. Rewind cancels running effects and restores the appropriate build state.
- Effects animate an inner content wrapper. Authored outer position, rotation, crop and opacity are not replaced by animation transforms.
- Reduced-motion mode preserves click-to-reveal semantics without entrance animation.
- Presenter keyboard, mouse and buttons use the same step count. New slides start at zero immediately instead of leaking the previous slide's step for one frame.
- Single-object pointer cancel is handled, and click-only pointer interactions do not create accidental snap/resize edits.

This is an entrance-build correction, not a full timeline with emphasis/exit/motion paths. Object animation import/export interoperability with PowerPoint remains unfinished.

## Export and concurrent work

During development the local agent pushed `7cf594b`, adding valid rotation parameters to `textShape` and `tableShape`. That change was retained, not replaced. The scene exporter now uses that rotation API while correcting CSS-pixel to PowerPoint-point font sizing, paragraph alignment/line spacing, transparent fills/borders and alpha. Targeted export/import assertions confirm size/alignment/rotation/opacity on text primitives.

## Verification actually performed in this environment

**23/23 targeted offline module checks passed.** An initial 18-case Node harness used a generated real PptxGenJS presentation containing Unicode text, a rotated shape, embedded image, table, chart and notes. It verified parsing, staged assets, fresh IDs, append/stale safeguards, ratio fit, package/relationship protections, abort and decompression limits. Five additional checks covered click dependencies, timing bounds, geometry-safe mocked playback, existing exporter helpers and Scene-text export/import size/alignment/rotation/opacity.

A targeted strict TypeScript build of the importer, helpers and playback module passed. TS/TSX source syntax was also parsed. Existing model interfaces were used as isolated type fixtures; this is **not** a full repository typecheck.

The container could not resolve GitHub for a full clone and does not contain the complete app dependencies. Consequently full Next.js build, actual repository Vitest execution, browser UI tests, database save/reload and Microsoft PowerPoint/LibreOffice visual comparison were **not run here**. The new repository tests below are for the local agent to execute; their grouping/count differs from the offline harness. No CI result for the new HEAD is claimed and no CI was awaited.

## Local agent handoff

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-pptx-import.test.ts __tests__/workspace/slide-scene-playback.test.ts
pnpm exec vitest run __tests__/workspace/slide-file-export.test.ts __tests__/workspace/slide-scene-pptx-geometry.test.ts __tests__/workspace/slide-pptx-native-groups.test.ts
pnpm test:workspace
pnpm build
```

Manual acceptance:

1. In both Office and Canvas, choose a 16:9 and a 4:3 PPTX with Vietnamese text, cropped/rotated pictures, notes, groups, a table and a simple bar chart. Inspect the report before confirming. Confirm slides append after existing content and remain individually editable.
2. Cancel while reading, while reviewing and during an image upload; ensure no slides are inserted. Test malformed, oversized, encrypted and externally linked files. Verify no external resource requests in browser network logs.
3. Change the deck in another tab/client while the import is open. Confirmation must refuse stale insertion. Revoke editing permission and navigate to another board during upload; neither must publish into the wrong document.
4. Save/reload, then export PPTX and PDF. Compare text size, alignment, opacity, crop, rotation and groups visually. Open in actual PowerPoint; do not treat XML presence as proof of fidelity.
5. Construct A=`on-click`, B=`after-previous`, C=`with-previous`, D=`on-click`. A/B/C must all wait for click 1; D waits for click 2. Test keyboard/buttons/surface clicks, backwards navigation, first/last slides, grid jumps, reduced motion and a rotated semi-transparent text object.
6. Verify preexisting HTML decks, inline text, group resize/rotate, image upload and export still behave correctly. Keep the PR draft until the application-level checks are complete.
