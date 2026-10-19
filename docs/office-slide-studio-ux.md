# Slide Studio — production UI layout and host integration

Updated 2026-10-19. Branch `feat/office-slide-scene-v2`, PR #56. **This is UI development, not a claim of completed visual QA.** The original host's Workspace save/auth/command contracts are untouched.

## Why the previous editor felt unlike a production presentation app
- Three stacked always-visible strips (deck header, animation settings, Scene/HTML mode) before the scene command bar; nested-group navigation was also always visible.
- Full animation timeline consumed canvas height even for ordinary text/layout work.
- Narrow right sidebar mixed objects, layers, geometric arrangement and every kind of property in a continuous list.
- Slide thumbnails were only at the bottom, while normal widescreen presentation editing uses a left slide navigator.
- No focused working environment outside a resizable Workspace canvas block.
- Scene edit stage was limited mainly by width; the parent viewport height was not accounted for.

## Changes implemented
- `Studio` / `Exit Studio` in deck header opens/closes a fullscreen React portal. This renders the **same Workspace editor and data**, not a second save system. Host selection/permissions and existing import/export/presenter actions remain intact.
- Studio layout: vertical slide rail at desktop widths (horizontal scroll strip on narrow screens), central stage, Layers/Format inspector on the right.
- Scene canvas fits by **both height and width** via CSS container units at actual 16:9 or 4:3 ratio. The slide remains the visual centre with a neutral grey work surface.
- Core editor now has an **always-visible two-row ribbon**. One-click Text box, Shape, Image upload, Chart, Table, Diagram plus Undo/Redo are no longer hidden in an Insert dropdown. The contextual Format row offers text styling, alignment, shape type, color and selection actions. Image URL remains secondary.
- Inspector can be hidden. Its **Layers** and **Format** tabs separate navigation/order from object properties. Selection via canvas opens Format; selection within Layers stays in Layers for multiple operations.
- Animation timeline is collapsed by default and opened intentionally, including from an object's properties.
- Group navigation appears only when a group exists or is being edited, and legacy HTML conversion is labelled `Convert to objects`. The destructive restore action is under Advanced.
- Read-only slide rail disables creation, drag reordering and mutating settings, while slide navigation remains enabled.
- Slide numbers for Scene mode are overlaid on the slide itself, instead of in the corner of the surrounding editing work area.
- Studio has dialog semantics, initial focus, Tab containment and separate layering so Present and import dialogs can remain above it. Escape in other portals must not close Studio.

## Local agent automated checks
```sh
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-studio-layout.test.tsx __tests__/workspace/slide-studio-navigation.test.tsx
pnpm test:workspace
pnpm build
```

## Required browser QA (agent local)
1. Open a Scene V2 slide within the host canvas block, click Studio, verify fullscreen; exit back to the same slide without losing persisted content.
2. Verify nav is **left on 1280/1440/1920px desktop**, horizontal along bottom on 375/768px compact layouts, and all slide thumbnails/add controls are reachable.
3. Test slide add/select/reorder/rename/duplicate/delete in Studio. Refresh page; all actions must persist through the original board pipeline.
4. On Scene editor, confirm page is centred, fully visible and at correct 16:9 and 4:3 ratio when inspector/timeline are independently toggled; no cropped lower edge.
5. Test text insertion, existing text edit, image upload, Diagram dialog, right Format panel and undo/redo. No duplicated controls or changes to scene JSON format.
6. Test Layers panel selection and Shift-multi-select without auto-switching panels; canvas object selection should reveal formatting controls.
7. Ensure animation timeline is absent by default, opens/closes on demand, and `Open animation timeline` from object properties reveals it without data edits.
8. Confirm keyboard focus starts on `Exit Slide Studio`, Tab stays within Studio, and Escape exits Studio but does **not** double-exit from Presenter or close nested dialogs unintentionally.
9. Test Present and return; overlays must appear above Studio. Also test Import PPTX, export menus, chart editor, crop dialog and text formatting popovers for correct z-index.
10. Confirm no mutating slide controls appear active under host readOnly, including slide order, Settings menu, shape insertion, aspect ratio and theme.
11. Check dark/light theme, browser zoom at 80/100/125/150%, trackpad horizontal scroll, small Canvas block embedded in a board, and 60-slide list performance.
12. Validate keyboard-only and screen-reader announcement for slide selection, Studio, Inspector and Animation toggles.

## Remaining UX refinement
Full object-selection toolbar conventions, drag guides, slide-level context menus, keyboard arrow navigation in the filmstrip, resizable inspector and explicit save/sync indicator should be assessed *after browser QA*. These are UX tasks, not an excuse to rewrite the host's persistence or agent architecture. No screenshot/video or local browser acceptance run was performed in this remote code-editing environment.

## Follow-up: keep every common action discoverable

The first Studio pass hid Text box, Shape, Chart and Table under an Insert select. This was a UX regression: the user could not find the actual creation toolbar. Fixed via `SlideSceneRibbon.tsx`:

- Primary buttons are visible at all times with label + icon, not nested inside a selector: **Text box, Shape, Image, Chart, Table, Diagram**.
- Undo/Redo remain on the first row. Inspector and Animation toggle panel visibility; their controls are never the only route to insert content.
- The second row is selection-aware: text formatting (Bold/Italic/Underline, font size, alignment and color), shape type and fill, duplication, deletion and group actions. Heavy chart/table/shape properties remain in the Format inspector via a visible settings button.
- The ribbon wraps to multiple lines for narrow embedded Workspace blocks; it does not hide the primary tools behind an overflow menu.
- Images are inserted via Upload from the visible button; pasting a URL remains available as a secondary feature.
- Added `slide-scene-ribbon.test.tsx` covering one-click creation, in-place formatting, settings and read-only protection. `slide-studio-layout.test.tsx` was adapted to the new button surface.

Browser QA should confirm the full insertion row is readable without horizontal scrolling at 1280px Studio, and wraps without truncation on narrower Canvas blocks. Follow-up functionality in an app should be discoverable first, not merely accessible through hidden menus.
