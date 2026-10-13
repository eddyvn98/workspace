// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { compactAgentBlock } from "@/app/api/workspaces/[id]/agentReadSummary";
import { parseThemePatch } from "@/app/api/workspaces/[id]/agent/slideValidation";
import { normalizeSlideTheme, slideTextStyle } from "@/app/workspace/utils/slideTheme";
import { SLIDE_THEME_PRESET_IDS, SLIDE_THEME_PRESETS, themeFromPreset } from "@/app/workspace/utils/slideThemePresets";
import { SLIDE_TYPOGRAPHY_CSS } from "@/app/workspace/utils/slideTypography";
import { addSlide, normalizeSlideDeckData, updateDeckTheme } from "@/app/workspace/utils/slideDeckOps";
import { SLIDE_LAYOUT_CHOICES, starterSlide } from "@/app/workspace/utils/slideLayoutTemplates";
import { SLIDE_LAYOUTS } from "@/app/api/workspaces/[id]/agent/slideLayouts";

describe("slide theme presets", () => {
  it("every preset is a complete, valid theme", () => {
    for (const id of SLIDE_THEME_PRESET_IDS) {
      const theme = normalizeSlideTheme(themeFromPreset(id));
      expect(theme).toMatchObject({ preset: id, ...SLIDE_THEME_PRESETS[id].theme });
      expect(Object.keys(theme!).sort()).toEqual(["accentColor", "backgroundColor", "fontFamily", "preset", "textColor"]);
    }
  });

  it("parseThemePatch expands presets, lets explicit fields win and clears the preset on manual colours", () => {
    expect(parseThemePatch("Corporate Blue")).toMatchObject({ ok: true, patch: { preset: "corporate-blue", accentColor: "#1d4ed8" } });
    expect(parseThemePatch({ preset: "warm", textColor: "#000000" })).toMatchObject({ ok: true, patch: { preset: "warm", textColor: "#000000", backgroundColor: "#fff7ed" } });
    expect(parseThemePatch({ textColor: "#000000" })).toMatchObject({ ok: true, patch: { textColor: "#000000", preset: undefined } });
    expect(parseThemePatch({ preset: "x" })).toMatchObject({ ok: false });
    expect(parseThemePatch({ accentColor: "url(x)" })).toMatchObject({ ok: false });
  });

  it("update_slide_deck applies a preset to an existing deck and a later manual colour drops the preset id", () => {
    const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const id = applyAgentAction(board, { type: "create_slide_deck", slides: [{ layout: "title", title: "A" }] }).ids[0];
    expect(applyAgentAction(board, { type: "update_slide_deck", blockId: id, theme: { preset: "forest" } }).ids).toEqual([id]);
    expect(normalizeSlideDeckData(board.blocks[id].data as never).theme).toMatchObject({ preset: "forest", accentColor: "#16a34a" });
    applyAgentAction(board, { type: "update_slide_deck", blockId: id, theme: { textColor: "#111111" } });
    const theme = normalizeSlideDeckData(board.blocks[id].data as never).theme!;
    expect(theme.preset).toBeUndefined();
    expect(theme.textColor).toBe("#111111");
    expect(theme.accentColor).toBe("#16a34a");
  });

  it("UI theme changes keep or drop the preset id like the agent does", () => {
    const deck = normalizeSlideDeckData({ theme: themeFromPreset("dark") });
    expect(updateDeckTheme(deck, { accentColor: "#ff0000" }).theme?.preset).toBeUndefined();
    expect(updateDeckTheme(deck, themeFromPreset("warm")).theme?.preset).toBe("warm");
  });

  it("exposes the accent colour as a CSS variable with a default", () => {
    expect((slideTextStyle(themeFromPreset("dark")) as Record<string, string>)["--slide-accent"]).toBe("#38bdf8");
    expect((slideTextStyle(undefined) as Record<string, string>)["--slide-accent"]).toBe("#2563eb");
  });
});

describe("slide typography stylesheet", () => {
  it("sizes everything in container-query units so editor, thumbnails and Present mode scale together", () => {
    expect(SLIDE_TYPOGRAPHY_CSS).toContain("container-type: inline-size");
    expect(SLIDE_TYPOGRAPHY_CSS).not.toMatch(/font-size:\s*\d+(?:\.\d+)?px/);
    for (const root of [".ProseMirror", ".slide-html"]) {
      for (const selector of ["h1", "h2", "li", "blockquote", "td h1", "td h3", "th"]) expect(SLIDE_TYPOGRAPHY_CSS).toContain(`${root} ${selector}`);
    }
    expect(SLIDE_TYPOGRAPHY_CSS).toMatch(/font-size: 6\.4cqw/);
    expect(SLIDE_TYPOGRAPHY_CSS.match(/\{/g)?.length).toBe(SLIDE_TYPOGRAPHY_CSS.match(/\}/g)?.length);
  });
});

describe("manual add-slide layout picker", () => {
  it("offers every layout with starter content built from the same templates", () => {
    expect(SLIDE_LAYOUT_CHOICES.map((choice) => choice.layout)).toEqual([...SLIDE_LAYOUTS]);
    expect(starterSlide("stats").html).toContain("<h1>42%</h1>");
    expect(SLIDE_LAYOUTS.every((layout) => starterSlide(layout).name.length > 0)).toBe(true);
    const deck = addSlide(normalizeSlideDeckData({}), undefined, starterSlide("agenda"));
    expect(deck.slideOrder).toHaveLength(2);
    expect(deck.slides[deck.activeSlideId!].html).toContain("<ol>");
    expect(addSlide(normalizeSlideDeckData({})).slideOrder).toHaveLength(2);
  });
});

describe("single-slide read", () => {
  const block = {
    id: "d",
    type: "slideDeck",
    data: {
      slideOrder: ["s1", "s2"],
      slides: {
        s1: { id: "s1", name: "One", html: `<h2>One</h2><ul><li><p>${"word ".repeat(300)}</p></li></ul>`, presenterNotes: "note ".repeat(200) },
        s2: { id: "s2", name: "Two", html: `<p>${"word ".repeat(300)}</p>` },
      },
    },
  };

  it("returns complete html, text and notes only for the requested slides", () => {
    const summary = compactAgentBlock("d", block as never, "block", { fullSlideIds: new Set(["s1"]) });
    const [first, second] = (summary.data as { slides: Array<Record<string, string>> }).slides;
    expect(first.html).toBe(block.data.slides.s1.html);
    expect(first.htmlText.length).toBeGreaterThan(600);
    expect(first.presenterNotes.length).toBeGreaterThan(300);
    expect(second.html).toBeUndefined();
    expect(second.htmlText.length).toBeLessThanOrEqual(600);
  });
});
