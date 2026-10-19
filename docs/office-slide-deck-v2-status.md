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

## Application-first reliability pass — 2026-10-19

Focus: make Office Presentation usable for people and future agents **before** integrating code execution.

Confirmed source issues addressed on the PR branch:
- Previously, Scene V2 PDF export treated scene slides as empty HTML and produced blank pages. Added `pdf-scene.ts` and connected it to `pdf-export.ts`: positioned shapes/text/charts/uploaded images render through the existing PDF raster pipeline.
- Scene editor now shows the actual slide theme background rather than a hardcoded white design surface.
- Editor shortcuts are scoped to focus within the editor; the canvas is keyboard-focusable, reducing interference with other tools or browser tabs.
- Present mode keeps Previous/Next enabled while there are pending per-object click animation steps at the start/end of a deck.
- Added PDF and PowerPoint 4:3 geometry regression test files.

Local agent priority:
```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-pdf-export.test.ts __tests__/workspace/slide-scene-pptx-geometry.test.ts
pnpm test:workspace
pnpm build
```

Manual acceptance: create a dark Scene V2 deck, edit on a 4:3 and 16:9 canvas, verify keyboard input in a second editor is unaffected, export PDF and PPTX, inspect generated pages visually and verify presenter click-step navigation on first/last slides.

**Do not merge yet.** All changes are committed, but the repository is not available locally for automated build/browser execution in this tool environment. The Next.js scene editor and exporter remain unverified at runtime; advanced PPTX animation, import roundtrip and Code Execution Agent are explicitly deferred.

## Verified baseline and application UI continuation — 2026-10-19

- Local agent reported commit `e80ab905` built and tested locally. GitHub Actions on this SHA were independently verified: **Collection AI commands** and **Workspace universal quality gate** each concluded success (2/2). Exact local test logs were not attached.
- Additional work after that green baseline: editable text directly on the positioned slide via double-click, sidebar action, F2 or Enter. Ctrl/Cmd+Enter commits and Escape cancels. Each accepted edit is one Scene V2 change so undo has an atomic boundary.
- Added focus routing for clicked scene elements (arrow-key movement now stays scoped to the focused scene) and a jsdom UI test covering commit, cancel and keyboard submit.
- No new code-execution runtime was introduced: prioritize the editor as a usable environment for a future agent.

Local agent revalidation for the newer commits:
```sh
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-inline-text.test.tsx
pnpm test:workspace
pnpm build
```
Manual browser check: double-click an unlocked text box, edit and blur to save; Escape leaves text intact, F2/Enter opens edit mode, Ctrl/Cmd+Enter saves; locked/read-only text cannot be edited. Verify shortcuts work after clicking an object and do not affect neighboring Canvas editor instances. Test 4:3 and 16:9 decks after reload.

**Verification:** The CI successes apply to `e80ab905`. Subsequent commits need their own checks and manual QA before this PR is merged.

## Application completion batch: grouping, image fit and safe undo

Implemented after CI-green baseline `e80ab90` (not yet verified by the local agent):
- Persisted logical `groupId` in Scene V2. Group/Ungroup toolbar actions and Ctrl/Cmd+G shortcuts; Shift+G ungroups; clicking any member selects all group members.
- Group drag, arrow-key nudge, deletion, and duplication use selection-expanded geometry. Duplicates receive new object ids and group ids; locked members are not modified.
- Snap-to-grid toggle and horizontal/vertical distribution tools are now available in the Scene Editor.
- History snapshots invalidate if another Workspace synchronization updates the scene, preventing stale undo from reverting another editor's changes.
- Image fit modes `cover` / `contain` / `fill` are persisted and previewed in the editor and presenter, rendered in PDF, and mapped to native PowerPoint image cropping or contained geometry.
- The future Slide Script SDK accepts `imageFit` in its image authoring style.
- Async image uploads abort before inserting if the slide changed during upload, preventing stale scene overwrites.
- Added `slide-scene-groups.test.ts` and `slide-image-fit.test.ts`.

Local agent handoff:
```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-groups.test.ts __tests__/workspace/slide-image-fit.test.ts
pnpm test:workspace
pnpm build
```

Manual acceptance scenarios:
1. Group 3 objects via Shift-click, move with pointer and keyboard; verify original z-order, persisted group after reload, and locked-object immutability.
2. Ungroup; move one member without moving others. Duplicate a group; copies must not be linked to originals.
3. Test undo/redo of grouping, movement, duplication and image fit, then trigger a remote board update and verify stale local undo is cleared.
4. Disable snap and move a text box to non-grid coordinates; enable snap and verify 8px grid alignment.
5. Upload square and wide images, switch Cover/Contain/Fill, inspect editor, presenter, PDF and PowerPoint side by side; PowerPoint Cover uses editable `a:srcRect` crop.
6. Confirm user can modify slide while upload is pending without reverting that change.
7. Confirm read-only presentation can view groups and image fits without access to mutation controls.

Current limitations: Groups are logical in Scene V2 and are **not exported as a native PPTX group element**. Resizing a member affects only that member; group bounding-box transform, native PPTX grouping, and rich crop focal-point editing are future tasks.

PR remains draft until this new batch is tested. Do not infer CI results for HEAD from the prior `e80ab90` run.

## Group transformations and image focal cropping — 2026-10-19

Implemented and committed without waiting for CI:
- Scene selection bounding handles now resize and rotate multiple objects together, including proportional font scaling. Shift constrains rotation in 15-degree increments and preserves aspect ratio while resizing.
- Objects render transform previews during pointer interaction and commit one scene change when released. Sidebar provides Rotate ±15° and Scale ±10% controls.
- Images and editable PowerPoint charts now serialize individual OOXML rotations; PDF already honors individual rotation.
- Added image crop focus X/Y (0–100%) with interactive inspector sliders; HTML preview, PDF SVG, and PPTX asymmetric source crops now use the same values.
- Improved logical group z-order changes and locked-group atomicity; locked groups cannot be partly deleted, ungrouped, transformed or duplicated.
- Added regression tests: `slide-scene-group-transform.test.ts`, additional group-layer tests and image focal cropping tests.
- Updated application docs and PR status; **no new sandbox or coding-agent runtime** was introduced.

Local agent commands:
```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-scene-group-transform.test.ts __tests__/workspace/slide-scene-groups.test.ts __tests__/workspace/slide-image-fit.test.ts
pnpm test:workspace
pnpm build
```

Manual browser QA:
1. Shift-select 2–4 text/shape/chart/image objects and resize the selection via a corner. Verify text scales, all group members move proportionally, and Undo restores the original state.
2. Rotate the group by dragging its rotation handle; Shift should snap to 15° increments. Verify the shape/label centres remain correct after save and reload.
3. Lock one member. The group must refuse partial resize, rotate, delete, reorder or ungroup operations; independent unlocked objects must still be editable.
4. Use the layer buttons to move a non-contiguous group up and down. Confirm members maintain their relative z-order.
5. Upload a panoramic image, set Cover, then set focal X to 0, 50, 100; confirm the horizontal crop in the editor, fullscreen presenter, exported PDF and editable PowerPoint image.
6. Test Contain focal positioning with a portrait photo, and Fill stretching; test both 16:9 and 4:3.
7. Inspect native PowerPoint chart/image XML for `rot` and image `a:srcRect` attributes. Open actual exports in PowerPoint/LibreOffice and verify crop appearance and rotation before approving.

Known limitations:
- The selection bounds use the unrotated element boxes; an arbitrary composition of rotated objects can have visual extents outside the selection rectangle.
- Groups are logical Scene V2 groups, not native `p:grpSp` PowerPoint groups. The export preserves individual editable elements and their resulting geometry, but not group editability in Microsoft PowerPoint.
- Group resize is a geometric transform; complex text reflow and rich text are not yet fully faithful across renderers.
- This commit batch has **not** been run locally or verified through CI in this agent environment. The earlier passing CI at `e80ab90` cannot be attributed to newer commits.

## Native PPTX groups (contiguous objects only)

Additional implementation on the same branch:
- `lib/workspace/pptx-scene-groups.ts` packages adjacent scene objects sharing `groupId` in native OOXML `p:grpSp` with an identity coordinate transform and unique nonvisual ID.
- PowerPoint still sees independently editable text, shape, image and chart members inside supported groups.
- A group whose members have unrelated shapes interspersed across the z-order remains exported as individual shapes. This is intentional to avoid changing stacking or obscuring unrelated content.
- Regression tests in `slide-pptx-native-groups.test.ts`: contiguous group, disjoint fallback, shape mismatch, generated PPTX XML.

**Limitations:** The native OOXML grouping strategy and PowerPoint/LibreOffice fidelity are not yet visually validated. Group rotation and scaling are baked into member geometry, while the group wrapper uses an identity transform. Nested groups and groups with interspersed members are not preserved as native groups. No claim of full Microsoft PowerPoint parity.

Local verification:
```sh
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-pptx-native-groups.test.ts __tests__/workspace/slide-scene-group-transform.test.ts __tests__/workspace/slide-image-fit.test.ts __tests__/workspace/slide-scene-groups.test.ts
pnpm test:workspace
pnpm build
```

Open the generated PowerPoint file and verify: selecting the wrapper selects the grouped contents; Ungroup preserves each child position, font and image; user-editable chart still works after ungrouping. Compare with browser presenter and PDF. Run an interspersed-layer case and ensure the visual stacking is unchanged.
