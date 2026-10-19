# Slide Studio — ergonomics implementation and local acceptance

Date: 2026-10-19. PR #56, branch `feat/office-slide-scene-v2`.
This changes **view-only interface state** and pointer targets, **not** Workspace persistence, identity/auth, model provider, or the Scene V2 object schema.

## Implemented

1. **Zoom & pan:** `SlideSceneViewport.tsx` replaces the fixed Fit-only work surface.
   - Zoom 50%–400% **relative to the available Fit-slide size** via +/- controls or Ctrl/Cmd + wheel with a pointer-anchored focal point.
   - Fit resets view zoom and pan, without touching scene coordinates or history.
   - Space + pointer-drag or toggle Pan; supports mouse, touch and trackpad with pointer events. Entering Pan must not block the Zoom, Fit, or Pan buttons themselves.
   - Wheel is intercepted only for Ctrl/Cmd + wheel **over the work surface**, leaving normal page/rail scrolling alone. Focused buttons/inputs must retain Space-key activation.
2. **Target size:** ribbon actions are >=44px tall on compact layouts and >=40px on desktop; group/single-object corner resize and group rotation have 40x40px hit regions around smaller 12–16px visual grips. Drags disable native touch scrolling on the grip.
3. **Tool discovery:** `SlideRibbonScrollableRow.tsx` adds left/right arrows and keyboard-clickable scrolling whenever a primary or Format ribbon row actually overflows. Arrows respond to resize, selection-dependent tool sets and user scroll.
4. **Resizable Inspector:** `SlideSceneResizableInspector.tsx` provides a 240–480px dock on desktop with pointer-drag splitter and accessible left/right arrow-key increments. On tablet/mobile it keeps the full-width bottom panel. The viewport retains its chosen **relative zoom multiplier and pan** when other panels are opened or resized; Fit is always available for reset.

## Commands for local agent

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-studio-ergonomics.test.tsx __tests__/workspace/slide-studio-layout.test.tsx __tests__/workspace/slide-studio-navigation.test.tsx __tests__/workspace/slide-scene-ribbon.test.tsx
pnpm test:workspace
pnpm build
```

## Real-browser ergonomic acceptance checklist

- At 375, 768, 1280, and 1920px: all insertion tools remain reachable. When the ribbon overflows, arrow buttons appear, scroll the appropriate row and disappear appropriately at the end. Use keyboard Tab + Enter to reach hidden tools.
- On 1280x800 laptop: 1-click Text/Shape/Image/Chart/Table/Diagram; reach Fill/Text Format without opening menu. No accidental selection change on ribbon scroll.
- Zoom from Fit to 125/200/400%, out to 50%, return to Fit. Repeat after selecting text, dragging an image, editing a shape and opening animation. No stage aspect-ratio distortion or NaN coordinates; reloading returns to Fit by design.
- With the pointer over a specific slide location, Ctrl/Cmd + wheel should keep the same location under the pointer; normal wheel scroll outside the viewport is unchanged. Confirm browser page zoom does not activate while viewport intercepts this shortcut.
- Space+drag and Pan toggle can move a zoomed stage while object geometry remains fixed. Verify the Pan/Zoom/Fit buttons still click when Pan is active. Test touch pan on mobile.
- Resize a selected object or group using the 40px hit target on laptop trackpad and tablet touch. Ensure only the small inner marker is painted and dragging resizes/rotates the intended selection. Validate handles at slide edges.
- Resize Inspector between 240–480px by dragging its left splitter, then with focused arrow keys. No unintentional scene changes or broken canvas. Open/close Inspector and Animation while zoomed: view multiplier persists, and Fit remains usable.
- Check modal stacking for PPTX import/export and presentation, plus sticky Inspector header and scrollability at browser zoom 125%/150%.
- Confirm no slide undo entry and no board write is created by zoom, panning, ribbon scroll or Inspector width changes; save/reload scene JSON matches before these view-only operations.
- Measure tasks (create five slides, insert ten objects, format text, group, edit chart, add effects) with actual pointer distance, completion time, misclicks, and undo actions. Compare to prior build before claiming ergonomic improvement.

## Notes and limitations

The zoom label is *relative to automatic Fit*, not a fixed 100%-physical-pixel zoom. Inspector docking still changes the base Fit size as available viewport space changes, but manual zoom multiplier/pan are retained rather than reset. A fully fixed visual pixel scale across panel toggles would require a separate absolute-zoom model and explicit overflow/panning policies; it is not claimed here.

No real-browser test, full Vitest run, production build, or current-HEAD CI result is asserted by this remote implementation. The local agent owns that report. Keep PR Draft until UX browser verification and host integration pass.
