# Slide Coding Agent — Code-first Architecture

## Goal

A user describes a presentation. A coding agent writes TypeScript to create it, runs that code in an isolated worker, renders preview images, checks the design and iterates. The completed scene is editable in Office Slide Deck V2, and its PPTX is created by the exporter. **PowerPoint desktop is never automated or required.**

## Pipeline

1. Planner outlines narrative, evidence, content and art direction.
2. Coding agent generates `deck.ts` importing `createSlideScript` from `lib/slide-agent/slideScriptSdk.ts`.
3. Isolated sandbox worker runs the generated script with a predefined runtime, dependency cache, output limit and timeout. **The worker is not yet implemented.** Never run the generated script inside the Next.js process, or by using `eval`, `new Function` or unrestricted shell.
4. Validate output with `normalizeSlideScene` and `inspectSlideScene`. Route into the existing `create_slide_deck` action only after server auth/ACL, size checks and explicit document selection.
5. Render slides using a dedicated browser worker; capture images and scene geometry. **Visual screenshot inspection and re-prompt agent are not yet implemented.** The current quality inspector is deterministic and cannot judge aesthetic quality.
6. Agent reads failures/screenshots and patches script; use bounded iterations and retain previous working output.
7. Save editable scene and export PPTX/PDF as requested. PPTX object-level animation fidelity is not yet implemented.

## Suggested worker protocol

`POST /jobs`: `{boardId,script,modelTurnId,baseRevision,output:"scene"}`; authenticated backend only, scripts never directly submitted from an untrusted web client as privileged jobs.

Worker returns `{status,stdout,stderr,action,warnings,artifacts}`; status is `completed | failed | timeout`. Only prevalidated scene JSON can flow back into the Workspace mutation endpoint. Resource limits, process isolation, non-root, no secrets, read-only image, restricted mounts and network deny-by-default are mandatory.

## Authoring API (implemented foundation)

```ts
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
const deck = createSlideScript("AI in architecture");
deck.slide("The opportunity", slide => {
  slide.background("#0B1026");
  const heading = slide.text("AI in architecture", { x: 80, y: 110, w: 1050, h: 170 }, { fontSize: 68, color: "#FFFFFF" });
  slide.motion(heading, { kind: "fade", trigger: "after-previous", durationMs: 500 });
  slide.shape("#38BDF8", { x: 80, y: 330, w: 900, h: 8 });
  slide.chart([{label:"Design",value:72},{label:"Review",value:28}], { x: 80, y: 390, w: 800, h: 280 });
});
const result = deck.build(); // Structured editable action + quality warnings
```

The SDK is a deterministic authoring layer, **not itself an execution sandbox**. Current implementation status: SDK and unit tests committed; isolated script execution, browser rendering, agent loop, job orchestration and end-to-end persistence not implemented or tested.

## Integration with existing Dify setup

Keep Dify for model selection/inference, usage logs and tool selection. Add one coding-agent orchestrator plus a separately deployed sandbox worker. The existing `runWorkspaceAgentTurn`/JSON action executor may accept the resulting validated `create_slide_deck` action, but it must not execute model-authored TypeScript. The sandbox owns code execution and emits a file/scene, never direct database credentials or unrestricted APIs.

## Testing gates

- Unit: `pnpm exec vitest run __tests__/workspace/slide-script-sdk.test.ts`
- Static: `pnpm exec tsc --noEmit`
- Security: prove sandbox rejects filesystem/network access, timeouts, excessive output and malicious imports.
- Functional: generate slide script -> run worker -> scene -> browser render -> PowerPoint export -> reopen.
- Compatibility: legacy HTML decks and scene editor retain full access controls.

All tests unexecuted here. Do not deploy AI-generated code execution until sandbox isolation is verified.
