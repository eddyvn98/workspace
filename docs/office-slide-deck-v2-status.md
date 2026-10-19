# Office Slide Deck V2 — implementation and validation

## Status (2026-10-19)

Implemented on branch `feat/office-slide-scene-v2` without waiting for remote CI:
- Freeform Slide Scene V2 with independent text, shape and image objects, object order, geometric properties, optional per-object animation.
- Opt-in V2 editor on each slide; converts legacy rich text into approximate text/image objects while preserving original Tiptap HTML as a non-destructive backup.
- Layer sidebar with ordering/locking, position and size controls, motion properties; pointer drag on scalable scene.
- V2 preview in filmstrip, overview grid and fullscreen Presenter.
- Motion primitives per object, on-click reveal steps before advancing slides.
- AI action schema accepts `scene: {version:2, objects:[...]}` via existing `create_slide_deck` / `update_slide` paths; strict input parsing.
- PPTX export V2 preserves per-object placement, text, shapes, and uploaded images as editable primitives where supported.
- Unit tests added but NOT RUN in this restricted environment.

## Compatibility / known gaps

- PresentationML animation export is not implemented. Object-level effects work in web Presenter only.
- No PPTX import into Scene V2 yet.
- Current exported text OOXML does not preserve scene rotation, opacity or all typography; shape export is basic.
- No rich text boxes, connectors, charts as native V2 objects, group nesting, gradient/mask/video, or morph.
- No multi-select / resize handles / alignment snapping / undo transactions designed specifically for scene operations.
- AI generation requires a caller that emits `scene`; there is no dedicated art-direction planning/review agent yet.
- On-click reveal uses a sequential scene-object count. Other trigger modes still use initial entrance animation.
- External image URLs may not be exportable: use image uploads stored in Workspace.
- Best-effort legacy HTML conversion is implemented; table structures, complex formatting and some media are not reconstructed precisely. Original HTML stays available as backup in the stored payload.
- No local browser verification. Do not mark production-ready before local CI/playwright, interactive and PPTX inspection.

## Local agent test hand-off (do not wait for CI)

```sh
pnpm install
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-v2.test.ts
pnpm test:workspace
pnpm build
```

Manual test:
1. Open Office > Presentation with an existing HTML deck, confirm no visual or storage regression.
2. Add a new slide and enable Scene V2. Add text and shape; move, resize via sidebar, lock, reorder, delete.
3. Add an image using a Workspace-served URL; reload and verify persisted position and layering.
4. Set one object `on-click` animation; present and verify right arrow reveals it before advancing. Verify after-previous sequencing.
5. Verify thumbnails and Presenter draw the same positions.
6. Create a deck using `create_slide_deck` with a scene-only slide; verify objects render.
7. Export to PPTX, open in Microsoft PowerPoint and LibreOffice; verify editability, page size and object positions.
8. Run viewer/read-only mode and confirm scene controls cannot persist edits.
9. Test both 16:9 and 4:3 plus multiple browser widths and dark mode.
10. Validate that exported transitions work and explicitly document unsupported individual object animations.

## Remaining milestones for full PowerPoint parity

- **Phase B**: scene tools: native editable text, image crop, accurate resize handles, snap/alignment, undo/redo, groups, charts, shapes, shortcuts and accessibility.
- **Phase C**: timeline engine: per-object entrance/emphasis/exit, multi-track order and trigger, duration/delay/easing, on-click, reliable pause/rewind, transition presets and morph fallback.
- **Phase D**: PPTX engine: use proven PPTX parser/serializer (evaluate office-kit/pptx), import/edit/export with animation/transition interoperability tests.
- **Phase E**: AI art director: content outline, design tokens, per-slide composition, rich media, render-and-critique, deterministic repair, per-object updates and creative style variation.
- **Phase F**: performance, collaborative editing, file recovery, security, export cross-app regression suite.

This branch is a real working **foundation**, NOT final feature parity.

## Progress update — 2026-10-19, next implementation batch

Committed further work on the same PR branch:
- Corner resize handles in Scene Surface, geometry snapping and reusable resize/align/distribute/duplicate/nudge operations.
- Shift-click multi-selection and alignment, object duplication and arrow-key movement.
- Editor-local undo/redo (60 snapshots) and keyboard shortcuts; not a collaboration-aware transaction history.
- AI compositions: hero, split, metric, statement, columns, using editorial/technology/minimal/playful design tokens. Agent create_slide_deck and update_slide can now accept composition and designStyle or custom scene objects.
- Style-derived background on generated slides; AI composition tests.
- Corrected PPTX text rotation and explicit slide size parameter; no PPTX object animation export yet.
- Fixed legacy editor double-click conflict and stale selection after delete/duplicate.
- Added geometry and design composition regression tests.

### Still required before production
- Run tsc/vitest/build/Playwright and perform manual rendering checks; not run here because repository/dependencies cannot be cloned into local runtime.
- Verify CSS resize handles and timeline interactions in real browsers; visual QA still pending.
- Implement advanced shapes, editable charts, media, text editing directly on canvas, crop/mask, grouping and object-level timeline UI.
- Implement PPTX import/roundtrip, object-level animation/transition interoperability and full formatting fidelity.
- Add a render-and-critique AI design loop, error handling and visual QA for generated decks.
- Add role-safe collaborative undo/redo and large-deck performance profiling.

### Local test commands
```sh
pnpm install
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-v2.test.ts __tests__/workspace/slide-scene-geometry.test.ts __tests__/workspace/slide-scene-compositions.test.ts
pnpm test:workspace
pnpm build
```

### Additional implementation (same branch)

- Added per-object **visual timeline** (effect, trigger, duration, delay, track preview).
- Enabled `wipe` among the motion presets in the browser; PPTX export includes a slide-level wipe transition.
- Added direct image upload through Workspace's existing asset storage; the resulting image is a movable scene object.
- This is not a full PowerPoint timing engine: click build timing is basic, emphasis/exit and PPTX object animation are pending.
- No environment-backed success claim: GitHub commits are confirmed, but local TypeScript/test/build/browser validation still needs the local agent.

### Acceptance checks for new controls

1. Drag each corner handle; verify exact geometry after reload and both slide ratios.
2. Select two elements with Shift+click; align and nudge without modifying unselected elements.
3. Undo and redo geometry, layer and text changes; repeat after a collaborative update to check conflicts.
4. Upload an image, save/reopen, and export to PPTX; confirm the image uses the persisted Workspace URL.
5. Edit each object animation's timing using the timeline, including click, with-previous and after-previous.
6. Confirm deck AI input accepts `composition` + `designStyle`, with corresponding background palette.
7. Inspect slides in PowerPoint, LibreOffice and browser; report visual discrepancies and unsupported effects.

## 2026-10-19 continuation: charts and design quality preflight

### Commits in this batch
- Extended Scene V2 object kinds with validated `chart` data series and existing Workspace bar visualization.
- Enabled chart insertion and series editing in the Scene Editor sidebar.
- AI schema accepts chart objects, and PPTX exports chart as an editable chart with embedded workbook through the existing PPTX chart implementation.
- Added non-destructive `inspectSlideScene` quality warnings for overflow, small text, two-text collisions and low contrast. Warnings are visible in editor and returned as notes for AI slide creation.
- Inspector now uses actual slide background for the editor; AI composition uses chosen style background.
- New tests: `slide-scene-charts.test.ts` and `slide-scene-inspect.test.ts`.

### Remaining high priority / local agent action
- Run `pnpm exec tsc --noEmit`, `pnpm exec vitest run __tests__/workspace/slide-scene-*.test.ts`, `pnpm test:workspace`, `pnpm build`; correct any failures.
- Verify charts with negative/large data, resize, saved charts, PPTX open in actual PowerPoint.
- Scene group, crop/masks/media, object animations in PPTX, PPTX importing/roundtrip and full AI render-critique loop are not yet complete.
- Keep PR draft and do not merge until the above checks pass. GitHub connector commits alone do not establish runtime correctness.
