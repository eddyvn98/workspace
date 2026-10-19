# Office Slide Deck V2 — implementation and validation

## Status (2026-10-19)

Implemented on branch `feat/office-slide-scene-v2` without waiting for remote CI:
- Freeform Slide Scene V2 with independent text, shape and image objects, object order, geometric properties, optional per-object animation.
- Opt-in V2 editor on each slide; legacy Tiptap HTML slides are preserved, never automatically destructively converted.
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
- No migration from legacy rich HTML to independent scene objects; opt-in creates a new scene and retains HTML as backup.
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
4. Set one object `on-click` animation; present and verify right arrow reveals it before advancing.
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
