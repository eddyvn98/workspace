# Office Slide Deck: feature-gap reconciliation and integration handoff

Date: 2026-10-19. Repository: `eddyvn98/workspace`. PR #56, branch `feat/office-slide-scene-v2`.

## Scope and baseline

This work continues the identity-neutral editor/tool engine shared with the host application and `eddyvn98/agent-web`. It does not add authentication, a model provider, a separate agent, a sandbox, or another persistence service. Existing host save commands, read-only/lock state, resource limits and stale-edit checks remain authoritative.

The prior QA comment and 2/2 CI success belong to `6418d239`. At the start of this continuation HEAD was already `92b64f05`: it contained additional chart, paint, nested-group, rich-cell and diagram code. Those implementations were retained and inspected, not overwritten with the older code. The PR description still listed these families as absent; the inventory below supersedes that outdated description.

This is a completion pass over the named application feature families, with defined interchange support. It is not a claim of lossless compatibility with every feature in every PowerPoint file.

## Current application capabilities

| Family | Data/editor support | Import/export behavior |
| --- | --- | --- |
| Rich text in table cells | Mixed run/paragraph formatting inside native cells; merged regions retain covered content; draft-safe cell editor | Native DrawingML table and rich-text serialization; values, supported formatting and merges remain editable after import |
| Charts | Column, bar, line, area, pie, doughnut, scatter; up to 8 series / 100 categories; signed/null data; stacked/percentage bars and columns | Native charts and embedded editable workbooks, not screenshots; supported chart cache types read back as structured data |
| Gradient/shadow/mask | Linear gradient stops/angle, bounded outer shadows, preset/custom image masks | Shared SVG/browser/PDF geometry and native DrawingML paint/masks for the supported subset |
| Nested groups | Up to 16 grouping levels; group scope editing; fresh IDs on duplication; rotated bounds | Recursive native PowerPoint groups for contiguous layer spans; fallback preserves paint order where a group has interspersed members |
| Diagrams / SmartArt | Process, hierarchy and cycle layouts produce editable primitives, not a locked template | Saved SmartArt drawings are converted to editable grouped text/vector/image/connector objects; semantic fallback retains text/connections with a compatibility notice |
| Image placement | Automatic Cover/Contain/Fill plus exact four-edge source crop and four-edge destination padding | Source/destination rectangles survive two-axis crop, stretching, rotation and masks instead of being silently replaced by a cover approximation |
| Motion | Existing entrance/emphasis/exit/path tracks, ordering, click builds, preview/scrub controls | Existing supported native PPTX timing import/export is retained; see the multistage animation handoff |
| Shared SDK | Text, richText, vector/shape, native table, structured or legacy chart, diagram, group/ungroup, paint, mask and exact crop | Emits the existing `{action,warnings}` contract; no code execution or login behavior added |

Resource limits protect the editor/importer. They are not a list of permitted visual templates: every resulting primitive remains independently editable.

## Changes completed in this continuation

### Exact source and destination image geometry

`ScenePaintFields.imageCrop` and `.imageViewport` use `{left,top,right,bottom}` fractions. Presence of either opts into exact placement; automatic fit/focal point is used when both are absent. Valid insets are nonnegative and leave a nonzero visible region, with a lower bound to prevent unbounded image magnification. Image-only validation rejects these fields on other object kinds.

The browser, PDF and PowerPoint writer share the same source/destination mapping. The full authored outer frame is retained, so off-centre placement still rotates about the correct pivot. Mask and shadow wrappers remain independent of the source crop.

The importer reads `a:srcRect` and `a:fillRect` percentages, including percentage literals, and retains valid simultaneous horizontal and vertical crops. Outsets, invalid numeric values or empty regions are explicitly reported and normalized rather than accepted as unsafe geometry.

The inspector provides an atomic draft for all eight edge values. Apply validates and checks the source/crop signature; Cancel does not publish. Unrelated object movement can coexist with a crop edit. Choosing an automatic fit clears exact fields deliberately, and focal sliders are disabled while exact placement is authoritative.

### SmartArt and connector reliability

A per-import-path traversal guard tracks diagram parts and limits recursive cached-drawing references to 8 levels. Cyclic references fail before further recursion. Reusing the same diagram on a different branch of traversal remains allowed. Duplicate semantic node identifiers are rejected rather than silently mapped over one another.

Native connector objects now have a dedicated reader. Horizontal or vertical connectors with a valid zero-height/zero-width extent no longer disappear through the ordinary shape-frame validator. Parent transforms, rotation, flips, endpoints, supported line style and opacity become an editable line primitive. Bent/custom routes and end decorations are reported where simplified.

### Chart and group consistency

The chart importer now infers the supported nonzero value-axis policy from the correct axis, including scatter Y rather than X. A positive-only line/scatter chart configured without zero no longer reimports with forced zero.

Preflight now examines rotated visual bounds and every nested grouping level. Interspersed inner groups receive a native-group export warning even if the outer group itself is contiguous.

### SDK parity

- `chart()` accepts structured `SceneChartData` as well as existing legacy label/value arrays.
- `diagram()` inserts bounded editable process/hierarchy/cycle primitives.
- `group()` accepts object or prior group references and returns a group ID suitable for another nesting level. `ungroup()` removes the outer grouping level.
- Shape/text styles expose supported gradient/shadow fields. Image styles expose masks, shadows, exact crop and destination padding.
- All outputs continue through `normalizeSlideScene`; generated scripts are never run by this library.

Example:

```sh
pnpm exec tsx docs/examples/slide-engine-capabilities.ts > slide-capabilities.json
# Optional: pass an existing host-uploaded image URL as argument to include the crop example.
```

The example uses synthetic data. It prints an action only; the host is responsible for dispatching, saving and exporting it.

## New regression coverage handed to the local agent

Six new suites plus an expanded inspector suite were authored:

- `slide-exact-image-crop.test.ts`: exact placement algebra, validation, source/destination XML and two-axis import/export.
- `slide-exact-crop-ui.test.tsx`: draft apply/cancel, invalid crop, stale source changes and disabled controls.
- `slide-smartart-connectors.test.ts`: cached drawing, semantic fallback, zero-extent connectors, recursive diagram rejection.
- `slide-advanced-chart-roundtrip.test.ts`: seven chart types, multiple series, signed/null values, stacking, SVG escaping and embedded workbook packaging.
- `slide-paint-table-group-roundtrip.test.ts`: supported gradients/shadows/masks, rich merged cells and native nested group structure/scoped changes.
- `slide-sdk-capabilities.test.ts`: SDK data parity across the new feature families.
- `slide-scene-inspect.test.ts`: additional rotated-bound and nested interspersed-layer checks.

These repository Vitest suites were written, not executed as a complete application test run in this environment. Development proceeded without waiting for GitHub CI.

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm exec vitest run __tests__/workspace/slide-exact-image-crop.test.ts __tests__/workspace/slide-exact-crop-ui.test.tsx __tests__/workspace/slide-smartart-connectors.test.ts
pnpm exec vitest run __tests__/workspace/slide-advanced-chart-roundtrip.test.ts __tests__/workspace/slide-paint-table-group-roundtrip.test.ts __tests__/workspace/slide-sdk-capabilities.test.ts __tests__/workspace/slide-scene-inspect.test.ts
pnpm test:workspace
pnpm build
```

Use the host's existing editor fixture. Do not create a new login system for this extraction.

## Verification actually performed here

Two pure modules were compiled using strict TypeScript and checked independently: `slideSceneImageCrop.ts` and `diagram-guard.ts`. Their local copies matched the committed Git blob hashes `46d9c87f7c346febf4fab0590d73c9e5fa6f1d11` and `90273943d63a2a11709d7c05d0b411be0a8614bc` respectively.

Six isolated checks passed, including 10,000 deterministic valid image-crop combinations, invalid crop rejection, DrawingML percentage conversion, immutable traversal state and diagram cycle/depth rejection. This is not a full repository TypeScript/Vitest pass, browser test, database test or visual PowerPoint test. No new CI result is claimed.

## Local visual/application acceptance

1. Load the example action into both Office and Canvas using the existing host integration. Save/reopen and verify mixed cell text, nested paths, chart nulls, paint fields and crop data remain present.
2. Import PNG/JPEG pictures with crop on both axes plus destination padding. Compare browser, PDF and actual PowerPoint appearance; edit crop, cancel and undo/redo. Switch deliberately back to auto fit and confirm the change is visible.
3. Import external SmartArt with a saved drawing, with no cache, and with nested cached drawings. Verify explicit fallback notices, editable labels/lines and absence of external fetch/execution. Cycle fixtures must refuse the import.
4. Edit all seven chart types, change source data and export. Open embedded data in actual PowerPoint, reimport, and compare numeric values, missing points, series order and nonzero line axes.
5. Apply linear gradients, shadow and image masks. Compare nonsquare/rotated objects across thumbnail, editor, presenter, PDF and PowerPoint.
6. Edit rich text inside a merged table cell, unmerge, regroup and animate the table. Confirm the table remains a single native chart-independent table object.
7. Enter a nested group scope, change inner content and return. Unrelated and interspersed layers must remain unchanged. Test locked members and duplication with independent nested IDs.
8. Re-run existing rich-text, native-table and motion suites: these feature families were retained, not replaced by another editor engine.

## Explicit compatibility boundaries, not hidden success claims

- SmartArt drawing conversion is not Microsoft's native SmartArt layout engine. Reapplying SmartArt-specific algorithms/styles in PowerPoint is not provided by the converted primitive group.
- Charts outside the seven supported types, combo/3D/radar/bubble/surface charts, arbitrary secondary-axis layouts, trendlines and error bars require conversion notices or further implementation. Cached data must never be represented as a silently faithful visual copy.
- Exact image insets currently support nonnegative crops and padding, not negative image outsets. Bent connectors/end decorations may simplify with notices; connector attachment semantics are not recreated.
- Gradients are linear; arbitrary radial/path gradients, all shadow variants, every mask/geometry formula, inherited theme/master/font shaping and all PowerPoint animation constructs are not universally reproduced.
- Native nested groups are preserved where layer spans permit grouping without changing visual stacking. Interspersed groups deliberately flatten at the affected level with preflight warnings.
- PDF text metrics still use the existing approximate font measurement; actual host fonts and PowerPoint rendering need visual comparison.

These limits remain explicit product/interchange boundaries. The supported feature families above are implemented; full universal PowerPoint parity is not being declared. CI and the local QA report must be associated with the exact new HEAD, not inherited from the previous green commit.
