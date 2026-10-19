# Slide Deck: multi-stage animation and native PPTX timing

Date: 2026-10-19. Repository: `eddyvn98/workspace`. Branch: `feat/office-slide-scene-v2`. PR: #56.

## Integration scope

This repository is an identity-neutral extraction for reintegration into the original application. This batch adds presentation functionality, not login, identity providers, service accounts or a second agent. The existing Workspace data/save contracts and the host-provided read-only flag remain in use. Code execution and the future agent harness remain separate from this application layer.

The earlier handoff `office-slide-pptx-import-playback.md` describes the staged importer. Its statement that all object animation import/export is missing is superseded **for the supported subset below**, not for every PowerPoint feature.

## Implemented end-to-end

- Multiple effects per object: entrance, emphasis, exit and relative motion paths.
- Animation order independent of object stacking order. Reordering layers does not rearrange the effect sequence; duplicating a group copies independent paths and appends the copied effects after existing effects.
- `on-click`, `with-previous`, `after-previous`, duration, delay and easing. Effects competing on the same object in one build are sequenced deterministically with a warning.
- Multi-track editor: add/remove effects, change category/preset/trigger, reorder effects across objects, edit timing and polyline waypoints.
- Preview dialog: next/previous click build, replay, pause/resume and scrub within a build. Preview uses the actual slide background. Fullscreen presentation uses the same schedule.
- Rewind reconstructs visibility and cumulative path displacement from immutable scene data. A later exit does not hide an object before its entrance; exit-only objects start visible.
- Effects preserve static position, rotation, crop and authored opacity. Relative path translation uses a separate presentation transform instead of mutating the saved object geometry.
- Reduced motion skips interpolation while preserving click-build state.
- Native PPTX export writes `p:timing`, `p:seq`, `p:animEffect`, `p:animMotion`, `p:animRot`, `p:animScale`, and visibility behaviors. This is not a screenshot/video substitute.
- Native PPTX import reads supported main-sequence effects and maps original `cNvPr` shape IDs onto the editable objects produced by the importer. Text, shapes, pictures and supported charts retain editable effect tracks after import.
- Unsupported effects, repeats, interactive triggers, complex paths and approximate conversions are reported. Embedded commands/media actions are never executed.
- Removed the old single-effect inspector inputs that could appear to edit a legacy `motion` while a newer `animations` array was authoritative.
- Added draft-safe property/timing/chart-data editing, explicit text edit conflict handling, and reusable scene history. This is local edit history, not a replacement for Workspace persistence.

## Supported animation subset

| Phase | Presets | Native representation | Import behavior |
|---|---|---|---|
| Entrance | Fade, Rise, Slide, Zoom, Wipe | Visibility + animEffect; transient motion/scale when needed | Supported whole-object main-sequence forms map back to presets |
| Emphasis | Pulse, clockwise full-turn Spin | animScale with autoreverse; animRot | Pulse is normalized to 112%; unsupported rotation angles are reported and skipped |
| Exit | Fade, Rise, Slide, Zoom, Wipe | animEffect out + final visibility | Supported whole-object forms become exit effects |
| Motion | Editable linear/polyline path | animMotion, slide-relative normalized coordinates | Bounded M/L/Z/E paths are imported; curves and unsupported coordinate systems are reported |

Rise/Slide/Zoom are composed from standard native behaviors, not a promise that every vendor preset uses identical interpolation. Wipe direction, custom acceleration, arbitrary zoom/pulse amplitudes and fly distances may be normalized with a notice on import. Animation of compound imported objects is applied to their editable parts; group-origin emphasis needs visual review.

## Data contract

`SlideSceneObject.animations` is authoritative when present, including an empty array. Old `motion` data remains readable when `animations` is absent. Existing HTML-only slides are not migrated automatically.

```ts
{
  id: "headline",
  kind: "text",
  x: 100, y: 100, w: 700, h: 120, rotation: 0,
  text: "Presentation title",
  animations: [
    { kind: "fade", phase: "entrance", trigger: "on-click", durationMs: 600, delayMs: 0, order: 0 },
    { kind: "pulse", phase: "emphasis", trigger: "after-previous", durationMs: 800, delayMs: 200, order: 1 },
    { kind: "move", phase: "motion", trigger: "on-click", durationMs: 1000, delayMs: 0, easing: "linear", order: 2,
      path: [{x:0,y:0},{x:120,y:40},{x:200,y:80}] },
    { kind: "fade", phase: "exit", trigger: "on-click", durationMs: 600, delayMs: 0, order: 3 }
  ]
}
```

Paths are relative scene-pixel offsets beginning at `(0,0)`. Limits: 12 effects/object, 240 effects/slide, 2-24 path points, duration 100-5000 ms, delay 0-10000 ms; path bounds are +/-1280 x and +/-960 y. Limits are resource/validation bounds, not fixed layout templates.

The pure authoring SDK now exposes `slide.effect(id, effect)` to append in call order and `slide.clearEffects(id)`. Existing `slide.motion(id, motion)` intentionally replaces that object's chain with one legacy-compatible effect. No script is executed by these changes.

## Files and integration points

- `types/slideSceneMotion.ts`: effect contract and normalization.
- `utils/slideSceneEffects.ts`: immutable effect editing/order.
- `utils/slideSceneSchedule.ts`: shared schedule and before/after state.
- `utils/slideSceneKeyframes.ts`, `utils/slideScenePlayback.ts`: DOM playback, path transforms and controls.
- `components/slides/SlideSceneTimeline.tsx`, `SlideSceneAnimationPreview.tsx`, `SlideSceneEffectFields.tsx`: editor and preview.
- `components/slides/SlideSceneProperties.tsx`, `hooks/useSlideSceneHistory.ts`: property drafts and local history.
- `lib/workspace/pptx-motion-behaviors.ts`, `pptx-scene-timing.ts`, `pptx-export.ts`: native timing export.
- `lib/workspace/pptx-import/timing-effects.ts`, `timing.ts`, `objects.ts`, `index.ts`: native timing import and target mapping.

Paths under `types`, `utils`, `hooks` and `components` are relative to `app/workspace/`.

## Local-agent verification handoff

No CI was awaited. Tests below were **authored, not executed in the current connector environment**. No new full-repository build, browser or Microsoft PowerPoint pass is claimed. The earlier 23/23 report belongs to the earlier importer/playback batch, not to these changes.

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-multistage-animation.test.ts __tests__/workspace/slide-animation-pptx-roundtrip.test.ts __tests__/workspace/slide-scene-effects-ui.test.tsx
pnpm exec vitest run __tests__/workspace/slide-scene-playback.test.ts __tests__/workspace/slide-pptx-import.test.ts __tests__/workspace/slide-file-export.test.ts __tests__/workspace/slide-scene-groups.test.ts
pnpm test:workspace
pnpm build
```

Functional acceptance in the host application:

1. Put entrance -> pulse -> path -> exit on one text object and another object's entrance between those effects. Reorder tracks without changing the layer order.
2. Verify click builds, automatic chains, delays, same-object overlap warning, pause/resume, scrub, replay and backwards navigation. Exit-only objects remain visible before their exit.
3. Use a rotated semi-transparent text box and cropped picture; playback must not overwrite saved x/y/rotation/opacity. Move a group containing animated objects, save and reopen.
4. Duplicate an animated group. Verify copied effects/paths are independent and append after the existing timeline. Reordering its paint layers must not reorder effects.
5. Export a 16:9 and a 4:3 PPTX, open in actual PowerPoint and inspect the Animation Pane and slideshow. Compare click order, duration, visibility, path endpoints and opacity with web playback.
6. Re-import that PPTX. Verify editable objects and effect tracks, then edit an effect and export again. Verify compound target and unsupported feature notices instead of assuming lossless roundtrip.
7. Import external presentations with unknown filters, curves, media triggers, repeats and duplicate nonvisual IDs. Verify explicit rejection/notices and no execution of external actions.
8. Open legacy `motion`-only and HTML-only decks, use inline text/group/crop/export flows, and verify no regression. PDF remains a static design export, not an animated document.
9. Reintegration uses the existing host permission/save adapter; do not add a separate login system to this extraction.

## Still outside this completed feature slice

Full PowerPoint formatting fidelity, mixed text-run editing, advanced editable shapes/tables/charts, true nested scene groups, arbitrary PowerPoint custom animation presets/curves/interactive sequences, and the future code-execution/visual-review agent remain separate development work. They are **not** classified as merely pending tests. Visual interoperability of this supported animation subset still requires the local-agent acceptance above.
